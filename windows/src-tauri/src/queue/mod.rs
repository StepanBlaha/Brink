//! Persisted FIFO write queue (port of WriteQueue.swift, plan 2.6.3).

pub mod executor;
pub mod op;

use crate::notion::NotionClient;
use crate::store::atomic::{read_json, write_json};
use op::{Operation, PendingWrite};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Outcome {
    Saved,
    /// Transient failure; the write stays queued (unless withdrawn).
    Queued {
        message: String,
    },
    /// Notion rejected the write; it was dropped and the caller should roll back.
    Failed {
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueState {
    pub pending: usize,
    pub last_error: Option<String>,
}

#[derive(Default)]
struct State {
    pending: Vec<PendingWrite>,
    last_error: Option<String>,
    outcomes: HashMap<String, Outcome>,
}

pub type Listener = Arc<dyn Fn(QueueState) + Send + Sync>;

pub struct WriteQueue {
    file: PathBuf,
    state: Mutex<State>,
    drain: tokio::sync::Mutex<()>,
    listener: Mutex<Option<Listener>>,
}

impl WriteQueue {
    pub fn open(file: PathBuf) -> Self {
        let pending: Vec<PendingWrite> = read_json(&file).unwrap_or_default();
        Self {
            file,
            state: Mutex::new(State {
                pending,
                ..Default::default()
            }),
            drain: tokio::sync::Mutex::new(()),
            listener: Mutex::new(None),
        }
    }

    pub fn set_listener(&self, l: Listener) {
        *self.listener.lock().unwrap() = Some(l);
    }

    pub fn state(&self) -> QueueState {
        let s = self.state.lock().unwrap();
        QueueState {
            pending: s.pending.len(),
            last_error: s.last_error.clone(),
        }
    }

    pub fn pending(&self) -> Vec<PendingWrite> {
        self.state.lock().unwrap().pending.clone()
    }

    fn save_and_notify(&self) {
        let (snapshot, st) = {
            let s = self.state.lock().unwrap();
            (
                s.pending.clone(),
                QueueState {
                    pending: s.pending.len(),
                    last_error: s.last_error.clone(),
                },
            )
        };
        if let Err(e) = write_json(&self.file, &snapshot) {
            crate::logging::error(&format!("queue save failed: {e}"));
        }
        let l = self.listener.lock().unwrap().clone();
        if let Some(l) = l {
            l(st);
        }
    }

    pub fn enqueue(&self, operation: Operation) {
        self.state
            .lock()
            .unwrap()
            .pending
            .push(PendingWrite::new(operation));
        self.save_and_notify();
    }

    pub async fn submit(&self, op: Operation, client: &NotionClient) -> Outcome {
        self.submit_with(op, client, true).await
    }

    /// With `retain = false` a write that could not be sent (transient, or stuck behind one) is
    /// withdrawn instead of staying persisted.
    pub async fn submit_with(&self, op: Operation, client: &NotionClient, retain: bool) -> Outcome {
        let write = PendingWrite::new(op);
        let id = write.id.clone();
        self.state.lock().unwrap().pending.push(write);
        self.save_and_notify();
        self.process(client).await;
        let outcome = {
            let mut s = self.state.lock().unwrap();
            s.outcomes.remove(&id).unwrap_or_else(|| Outcome::Queued {
                message: s
                    .last_error
                    .clone()
                    .unwrap_or_else(|| "Waiting to sync.".into()),
            })
        };
        if matches!(outcome, Outcome::Queued { .. }) && !retain {
            self.withdraw(&id);
        }
        outcome
    }

    fn withdraw(&self, id: &str) {
        let had = {
            let mut s = self.state.lock().unwrap();
            let n = s.pending.len();
            s.pending.retain(|w| w.id != id);
            s.pending.len() != n
        };
        if had {
            self.save_and_notify();
        }
    }

    /// Drains in order. Concurrent callers share one drain: later callers wait for it, then
    /// drain whatever is left.
    pub async fn process(&self, client: &NotionClient) {
        let _guard = self.drain.lock().await;
        self.drain(client).await;
    }

    async fn drain(&self, client: &NotionClient) {
        loop {
            let head = self.state.lock().unwrap().pending.first().cloned();
            let Some(write) = head else {
                let changed = {
                    let mut s = self.state.lock().unwrap();
                    s.last_error.take().is_some()
                };
                if changed {
                    self.save_and_notify();
                }
                return;
            };
            match executor::execute(&write.operation, client).await {
                Ok(()) => self.finish(&write.id, Outcome::Saved),
                Err(e) if e.is_transient() => {
                    {
                        let mut s = self.state.lock().unwrap();
                        s.last_error = Some(e.message());
                        s.outcomes.insert(
                            write.id.clone(),
                            Outcome::Queued {
                                message: e.message(),
                            },
                        );
                    }
                    self.save_and_notify();
                    return;
                }
                Err(e) => self.finish(
                    &write.id,
                    Outcome::Failed {
                        message: e.message(),
                    },
                ),
            }
        }
    }

    fn finish(&self, id: &str, outcome: Outcome) {
        {
            let mut s = self.state.lock().unwrap();
            s.pending.retain(|w| w.id != id);
            s.outcomes.insert(id.to_string(), outcome);
        }
        self.save_and_notify();
    }
}
