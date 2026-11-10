use super::Provider;
use futures_util::{StreamExt, stream::BoxStream};
use serde_json::{Value, json};
use std::collections::VecDeque;
use tokio::sync::OwnedSemaphorePermit;

const MAX_FRAME: usize = 256 * 1024;

pub(super) struct Reply {
    provider: Provider,
    upstream: BoxStream<'static, Result<axum::body::Bytes, reqwest::Error>>,
    buffer: Vec<u8>,
    lines: Vec<String>,
    queued: VecDeque<Value>,
    ended: bool,
    done: bool,
    output: usize,
    limit: usize,
    input_tokens: u64,
    _permit: OwnedSemaphorePermit,
}

impl Reply {
    pub fn new(
        provider: Provider,
        response: reqwest::Response,
        initial: Vec<Value>,
        permit: OwnedSemaphorePermit,
        limit: usize,
    ) -> Self {
        Self {
            provider,
            upstream: response.bytes_stream().boxed(),
            buffer: Vec::new(),
            lines: Vec::new(),
            queued: initial.into(),
            ended: false,
            done: false,
            output: 0,
            limit,
            input_tokens: 0,
            _permit: permit,
        }
    }

    fn fail(&mut self, message: &str) {
        self.ended = true;
        self.queued
            .push_back(json!({"type":"error", "message":message}));
    }

    fn frame(&mut self) {
        let data = std::mem::take(&mut self.lines).join("\n");
        if data.is_empty() {
            return;
        }
        if data == "[DONE]" {
            self.done = true;
            self.ended = true;
            self.queued.push_back(json!({"type":"done"}));
            return;
        }
        let Ok(value) = serde_json::from_str::<Value>(&data) else {
            self.fail("The provider sent an unreadable stream. The partial answer has been kept.");
            return;
        };
        if value.get("error").is_some() || value["type"] == "error" {
            self.fail("The provider interrupted this response. The partial answer has been kept.");
            return;
        }
        match self.provider {
            Provider::Openai => {
                if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                    self.delta(text);
                }
                if let Some(usage) = value.get("usage").filter(|v| v.is_object()) {
                    self.queued.push_back(json!({"type":"usage", "input_tokens":usage["prompt_tokens"], "output_tokens":usage["completion_tokens"]}));
                }
                if value["choices"][0]["finish_reason"] == "length" {
                    self.queued.push_back(
                        json!({"type":"limit", "message":"The response reached its output limit."}),
                    );
                }
            }
            Provider::Anthropic => {
                if value["type"] == "content_block_delta"
                    && value["delta"]["type"] == "text_delta"
                    && let Some(text) = value["delta"]["text"].as_str()
                {
                    self.delta(text);
                }
                if value["type"] == "message_start" {
                    self.input_tokens = value["message"]["usage"]["input_tokens"]
                        .as_u64()
                        .unwrap_or(0);
                }
                if value["type"] == "message_delta" {
                    self.queued.push_back(json!({"type":"usage", "input_tokens":self.input_tokens, "output_tokens":value["usage"]["output_tokens"]}));
                    if value["delta"]["stop_reason"] == "max_tokens" {
                        self.queued.push_back(json!({"type":"limit", "message":"The response reached its output limit."}));
                    }
                }
                if value["type"] == "message_stop" {
                    self.done = true;
                    self.ended = true;
                    self.queued.push_back(json!({"type":"done"}));
                }
            }
        }
    }

    fn delta(&mut self, text: &str) {
        self.output += text.len();
        if self.output > self.limit {
            self.fail("The response exceeded its size limit. The partial answer has been kept.");
        } else {
            self.queued.push_back(json!({"type":"delta", "text":text}));
        }
    }

    pub async fn next(&mut self) -> Option<Value> {
        loop {
            if let Some(value) = self.queued.pop_front() {
                return Some(value);
            }
            if self.ended {
                return None;
            }
            if let Some(index) = self.buffer.iter().position(|&b| b == b'\n') {
                let line: Vec<u8> = self.buffer.drain(..=index).collect();
                let Ok(line) = std::str::from_utf8(&line) else {
                    self.fail("The provider sent invalid text. The partial answer has been kept.");
                    continue;
                };
                let line = line.trim_end_matches(['\r', '\n']);
                if line.is_empty() {
                    self.frame();
                } else if let Some(data) = line.strip_prefix("data:") {
                    self.lines
                        .push(data.strip_prefix(' ').unwrap_or(data).to_string());
                }
                if self.lines.iter().map(String::len).sum::<usize>() > MAX_FRAME {
                    self.fail("The provider's stream exceeded its size limit.");
                }
                continue;
            }
            match self.upstream.next().await {
                Some(Ok(bytes)) => {
                    if self.buffer.len() + bytes.len() > MAX_FRAME { self.fail("The provider's stream exceeded its size limit."); }
                    else { self.buffer.extend_from_slice(&bytes); }
                },
                Some(Err(_)) => self.fail("Connection to the provider was interrupted. The partial answer has been kept; no automatic retry was made."),
                None => { if !self.done { self.fail("The provider closed the stream before finishing. The partial answer has been kept."); } else { self.ended = true; } },
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::Semaphore;

    async fn reply(
        provider: Provider,
        chunks: Vec<Vec<u8>>,
        limit: usize,
    ) -> (Reply, Arc<Semaphore>) {
        crate::init_crypto();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut scratch = [0u8; 4096];
            let _ = socket.read(&mut scratch).await;
            socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ntransfer-encoding: chunked\r\nconnection: close\r\n\r\n").await.unwrap();
            for chunk in chunks {
                socket
                    .write_all(format!("{:x}\r\n", chunk.len()).as_bytes())
                    .await
                    .unwrap();
                socket.write_all(&chunk).await.unwrap();
                socket.write_all(b"\r\n").await.unwrap();
                socket.flush().await.unwrap();
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
            socket.write_all(b"0\r\n\r\n").await.unwrap();
        });
        let response = reqwest::get(format!("http://{address}/")).await.unwrap();
        let slots = Arc::new(Semaphore::new(1));
        let permit = slots.clone().try_acquire_owned().unwrap();
        (Reply::new(provider, response, vec![], permit, limit), slots)
    }

    async fn drain(mut reply: Reply) -> Vec<Value> {
        let mut out = Vec::new();
        while let Some(value) = reply.next().await {
            out.push(value);
        }
        out
    }

    fn kinds(events: &[Value]) -> Vec<&str> {
        events.iter().map(|e| e["type"].as_str().unwrap()).collect()
    }

    #[tokio::test]
    async fn openai_frames_split_across_chunks_and_utf8_boundaries() {
        let frame = "data: {\"choices\":[{\"delta\":{\"content\":\"héllo\"}}]}\n\n"
            .as_bytes()
            .to_vec();
        let split = frame.iter().position(|&b| b == 0xC3).unwrap() + 1;
        let tail = b"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n".to_vec();
        let (r, slots) = reply(
            Provider::Openai,
            vec![frame[..split].to_vec(), frame[split..].to_vec(), tail],
            1000,
        )
        .await;
        let events = drain(r).await;
        assert_eq!(kinds(&events), ["delta", "usage", "done"]);
        assert_eq!(events[0]["text"], "héllo");
        assert_eq!(events[1]["output_tokens"], 2);
        assert_eq!(slots.available_permits(), 1);
    }

    #[tokio::test]
    async fn anthropic_events_yield_text_usage_and_limit() {
        let body = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":7}}}\n\n\
data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"max_tokens\"},\"usage\":{\"output_tokens\":4}}\n\n\
data: {\"type\":\"message_stop\"}\n\n";
        let (r, _) = reply(Provider::Anthropic, vec![body.as_bytes().to_vec()], 1000).await;
        let events = drain(r).await;
        assert_eq!(kinds(&events), ["delta", "usage", "limit", "done"]);
        assert_eq!(events[1]["input_tokens"], 7);
    }

    #[tokio::test]
    async fn unfinished_stream_reports_error_after_partial_text() {
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"part\"}}]}\n\n";
        let (r, slots) = reply(Provider::Openai, vec![body.as_bytes().to_vec()], 1000).await;
        let events = drain(r).await;
        assert_eq!(kinds(&events), ["delta", "error"]);
        assert_eq!(slots.available_permits(), 1);
    }

    #[tokio::test]
    async fn malformed_json_and_provider_errors_end_the_stream() {
        let (r, _) = reply(Provider::Openai, vec![b"data: {nope\n\n".to_vec()], 1000).await;
        assert_eq!(kinds(&drain(r).await), ["error"]);
        let (r, _) = reply(
            Provider::Anthropic,
            vec![b"data: {\"type\":\"error\",\"error\":{\"message\":\"secret\"}}\n\n".to_vec()],
            1000,
        )
        .await;
        let events = drain(r).await;
        assert_eq!(kinds(&events), ["error"]);
        assert!(!events[0].to_string().contains("secret"));
    }

    #[tokio::test]
    async fn output_over_the_limit_fails_and_oversized_frames_are_refused() {
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"abcdef\"}}]}\n\n";
        let (r, _) = reply(Provider::Openai, vec![body.as_bytes().to_vec()], 3).await;
        assert_eq!(kinds(&drain(r).await), ["error"]);
        let (r, _) = reply(Provider::Openai, vec![vec![b'a'; MAX_FRAME + 1]], 1000).await;
        assert_eq!(kinds(&drain(r).await), ["error"]);
    }

    #[tokio::test]
    async fn dropping_a_reply_releases_its_slot() {
        let (r, slots) = reply(Provider::Openai, vec![b"data: [DONE]\n\n".to_vec()], 1000).await;
        assert_eq!(slots.available_permits(), 0);
        drop(r);
        assert_eq!(slots.available_permits(), 1);
    }
}
