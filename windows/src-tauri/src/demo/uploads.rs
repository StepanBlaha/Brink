//! File uploads of the fake Notion: create, send (multipart), attach as an image block.
//! Bytes stay in memory; an attached image becomes a `data:` URL, which the app's CSP allows.

use super::handlers::{not_found, Reply};
use super::store::{Store, Upload};
use serde_json::{json, Value};

pub fn handle(s: &mut Store, id: &str, sub: &str, body: &Value, raw: &[u8]) -> Reply {
    if id.is_empty() {
        let new_id = format!("demo-upload-{}", s.take_id());
        let filename = body["filename"].as_str().unwrap_or("image.png").to_string();
        s.uploads.insert(
            new_id.clone(),
            Upload {
                filename,
                status: "pending".into(),
                bytes: None,
            },
        );
        return (200, object(s, &new_id));
    }
    let Some(up) = s.uploads.get_mut(id) else {
        return not_found();
    };
    if sub != "send" {
        return not_found();
    }
    up.bytes = multipart_file(raw);
    up.status = "uploaded".into();
    (200, object(s, id))
}

fn object(s: &Store, id: &str) -> Value {
    let up = s.uploads.get(id);
    json!({ "object": "file_upload", "id": id,
            "status": up.map_or("pending", |u| u.status.as_str()),
            "filename": up.map_or("", |u| u.filename.as_str()), "content_type": "image/png",
            "upload_url": format!("https://example.invalid/upload/{id}") })
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    hay.get(from..)?
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|i| i + from)
}

/// The bytes of the first part of a multipart/form-data body.
pub fn multipart_file(raw: &[u8]) -> Option<Vec<u8>> {
    let start = find(raw, b"\r\n\r\n", 0)? + 4;
    let end = (start..raw.len())
        .rev()
        .find(|&i| raw[i..].starts_with(b"\r\n--"))?;
    (end >= start).then(|| raw[start..end].to_vec())
}

pub fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= c.len() {
                out.push(T[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// An appended `image` block from a file upload becomes a Notion-hosted `file` image.
pub fn attach(s: &Store, boxed: &Value) -> Value {
    let id = boxed["file_upload"]["id"].as_str().unwrap_or("");
    let bytes = s.uploads.get(id).and_then(|u| u.bytes.as_ref());
    match (boxed["type"].as_str(), bytes) {
        (Some("file_upload"), Some(b)) => json!({ "type": "file", "caption": [], "file": {
            "url": format!("data:image/png;base64,{}", base64(b)),
            "expiry_time": "2099-01-01T00:00:00.000Z" } }),
        _ => boxed.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn multipart_part_bytes_are_extracted() {
        let body =
            b"--B\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\nPNGDATA\r\n--B--\r\n";
        assert_eq!(multipart_file(body).unwrap(), b"PNGDATA");
    }
}
