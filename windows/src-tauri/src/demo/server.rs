//! A tiny HTTP/1.1 server on `127.0.0.1:0` (tokio sockets, no extra crate) in front of `Store`.
//! One JSON reply per request, keep-alive, `Content-Length` bodies only (the Notion client
//! never sends chunked bodies).

use super::handlers::handle;
use super::store::Store;
use serde_json::Value;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub type Shared = Arc<Mutex<Store>>;
const MAX_BODY: usize = 64 * 1024 * 1024;

pub struct Server {
    pub addr: SocketAddr,
    pub store: Shared,
}

impl Server {
    /// The value for `NotionClient::with_base_url`.
    pub fn base_url(&self) -> String {
        format!("http://{}/v1", self.addr)
    }
}

/// Binds a loopback port synchronously and serves it on the app's async runtime.
pub fn start() -> std::io::Result<Server> {
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))?;
    listener.set_nonblocking(true)?;
    let addr = listener.local_addr()?;
    let store: Shared = Arc::new(Mutex::new(Store::seeded()));
    tauri::async_runtime::spawn(serve(listener, store.clone()));
    Ok(Server { addr, store })
}

async fn serve(listener: TcpListener, store: Shared) {
    let Ok(listener) = tokio::net::TcpListener::from_std(listener) else {
        return;
    };
    loop {
        let Ok((sock, _)) = listener.accept().await else {
            continue;
        };
        tokio::spawn(connection(sock, store.clone()));
    }
}

struct Request {
    method: String,
    path: String,
    body: Vec<u8>,
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

async fn read_request(sock: &mut tokio::net::TcpStream, buf: &mut Vec<u8>) -> Option<Request> {
    let head_end = loop {
        if let Some(i) = find(buf, b"\r\n\r\n") {
            break i;
        }
        let mut chunk = [0u8; 8192];
        let n = sock.read(&mut chunk).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).into_owned();
    let mut lines = head.lines();
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_string();
    let target = first.next()?;
    let path = target.split('?').next().unwrap_or("").to_string();
    let len = lines
        .filter_map(|l| l.split_once(':'))
        .find(|(k, _)| k.trim().eq_ignore_ascii_case("content-length"))
        .and_then(|(_, v)| v.trim().parse::<usize>().ok())
        .unwrap_or(0);
    if len > MAX_BODY {
        return None;
    }
    let total = head_end + 4 + len;
    while buf.len() < total {
        let mut chunk = [0u8; 65536];
        let n = sock.read(&mut chunk).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let body = buf[head_end + 4..total].to_vec();
    buf.drain(..total);
    Some(Request { method, path, body })
}

async fn connection(mut sock: tokio::net::TcpStream, store: Shared) {
    let mut buf = Vec::new();
    while let Some(req) = read_request(&mut sock, &mut buf).await {
        let json: Option<Value> = serde_json::from_slice(&req.body).ok();
        let (status, reply) = {
            let mut s = store.lock().unwrap_or_else(|e| e.into_inner());
            handle(&mut s, &req.method, &req.path, json.as_ref(), &req.body)
        };
        let payload = reply.to_string();
        let head = format!(
            "HTTP/1.1 {status} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
            if status == 200 { "OK" } else { "Error" },
            payload.len()
        );
        let mut out = head.into_bytes();
        out.extend_from_slice(payload.as_bytes());
        if sock.write_all(&out).await.is_err() {
            return;
        }
    }
}
