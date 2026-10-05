//! `multipart/form-data` builder (port of MultipartFormData) and the file upload flow.

use super::client::{Body, NotionClient};
use super::error::NotionError;
use serde_json::{json, Value};

pub const SINGLE_PART_LIMIT: usize = 20 * 1024 * 1024;

pub struct MultipartFormData {
    pub boundary: String,
    body: Vec<u8>,
}

fn escape(s: &str) -> String {
    s.replace('"', "%22").replace(['\r', '\n'], "")
}

impl MultipartFormData {
    pub fn new() -> Self {
        Self::with_boundary(format!(
            "NotionDock-{}",
            uuid::Uuid::new_v4().to_string().to_uppercase()
        ))
    }

    pub fn with_boundary(boundary: String) -> Self {
        Self {
            boundary,
            body: Vec::new(),
        }
    }

    pub fn content_type(&self) -> String {
        format!("multipart/form-data; boundary={}", self.boundary)
    }

    pub fn add_field(&mut self, name: &str, value: &str) {
        self.push(&format!("--{}\r\n", self.boundary));
        self.push(&format!(
            "Content-Disposition: form-data; name=\"{}\"\r\n\r\n",
            escape(name)
        ));
        self.push(value);
        self.push("\r\n");
    }

    pub fn add_file(&mut self, name: &str, filename: &str, content_type: &str, data: &[u8]) {
        self.push(&format!("--{}\r\n", self.boundary));
        self.push(&format!(
            "Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\n",
            escape(name),
            escape(filename)
        ));
        self.push(&format!("Content-Type: {content_type}\r\n\r\n"));
        self.body.extend_from_slice(data);
        self.push("\r\n");
    }

    pub fn finalized(&self) -> Vec<u8> {
        let mut out = self.body.clone();
        out.extend_from_slice(format!("--{}--\r\n", self.boundary).as_bytes());
        out
    }

    fn push(&mut self, s: &str) {
        self.body.extend_from_slice(s.as_bytes());
    }
}

impl Default for MultipartFormData {
    fn default() -> Self {
        Self::new()
    }
}

impl NotionClient {
    pub async fn create_file_upload(
        &self,
        filename: &str,
        content_type: &str,
    ) -> Result<Value, NotionError> {
        self.request(
            "POST",
            "file_uploads",
            &[],
            Some(
                json!({"mode": "single_part", "filename": filename, "content_type": content_type}),
            ),
        )
        .await
    }

    pub async fn send_file_upload(
        &self,
        id: &str,
        data: &[u8],
        filename: &str,
        content_type: &str,
    ) -> Result<Value, NotionError> {
        let mut form = MultipartFormData::new();
        form.add_file("file", filename, content_type, data);
        let bytes = self
            .perform_request(
                "POST",
                &format!("file_uploads/{id}/send"),
                &[],
                Body::Raw {
                    data: form.finalized(),
                    content_type: form.content_type(),
                },
            )
            .await?;
        serde_json::from_slice(&bytes).map_err(|e| NotionError::Decoding(e.to_string()))
    }

    /// Create + send. Returns the file upload id, ready to attach.
    pub async fn upload_file(
        &self,
        data: &[u8],
        filename: &str,
        content_type: &str,
    ) -> Result<String, NotionError> {
        if data.len() > SINGLE_PART_LIMIT {
            return Err(NotionError::TooLarge { bytes: data.len() });
        }
        let created = self.create_file_upload(filename, content_type).await?;
        let id = created
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| NotionError::Decoding("file upload has no id".into()))?
            .to_string();
        let sent = self
            .send_file_upload(&id, data, filename, content_type)
            .await?;
        let status = sent.get("status").and_then(Value::as_str).unwrap_or("");
        if status != "uploaded" {
            return Err(NotionError::NotUploaded {
                status: status.to_string(),
            });
        }
        Ok(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multipart_exact_bytes() {
        let mut f = MultipartFormData::with_boundary("B".into());
        f.add_file("file", "a\"b\n.png", "image/png", &[1, 2, 3]);
        let mut expected = Vec::new();
        expected.extend_from_slice(
            b"--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a%22b.png\"\r\nContent-Type: image/png\r\n\r\n",
        );
        expected.extend_from_slice(&[1, 2, 3]);
        expected.extend_from_slice(b"\r\n--B--\r\n");
        assert_eq!(f.finalized(), expected);
        assert_eq!(f.content_type(), "multipart/form-data; boundary=B");
    }

    #[test]
    fn default_boundary_prefix() {
        assert!(MultipartFormData::new().boundary.starts_with("NotionDock-"));
    }
}
