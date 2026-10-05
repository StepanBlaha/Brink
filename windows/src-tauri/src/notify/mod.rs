//! Reminder delivery (plan 3.f). TypeScript plans (`reminderPlanner.ts`); this module keeps the
//! registry of what is scheduled (`notify.json`) and hands it to the platform: scheduled toasts on
//! Windows, a logging no-op elsewhere (Mac dev).

pub mod delivery;
pub mod xml;

use crate::store::atomic;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// One notification the app wants pending. `kind`: `item`, `summary` or `snooze`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyRequest {
    pub identifier: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub fire_at_ms: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pin_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
}

pub trait Delivery: Send + Sync {
    /// Schedules (replacing any toast with the same identifier).
    fn schedule(&self, req: &NotifyRequest) -> Result<(), String>;
    fn cancel(&self, identifier: &str);
    /// `enabled`, or why not: `disabledForApplication`, `disabledForUser`, `disabledByGroupPolicy`, `disabledByManifest`.
    fn permission(&self) -> String;
}

/// Entries this long past their fire time are forgotten (delivered or missed).
const KEEP_PAST_MS: i64 = 60_000;

pub struct NotifyState {
    path: PathBuf,
    entries: Mutex<BTreeMap<String, NotifyRequest>>,
    delivery: Box<dyn Delivery>,
}

impl NotifyState {
    pub fn open(path: PathBuf, delivery: Box<dyn Delivery>) -> Self {
        let list: Vec<NotifyRequest> = atomic::read_json(&path).unwrap_or_default();
        let entries = list
            .into_iter()
            .map(|r| (r.identifier.clone(), r))
            .collect();
        Self {
            path,
            entries: Mutex::new(entries),
            delivery,
        }
    }

    /// Everything still to fire (`pendingNotificationRequests`).
    pub fn pending(&self, now_ms: i64) -> Vec<NotifyRequest> {
        let e = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        e.values()
            .filter(|r| r.fire_at_ms > now_ms)
            .cloned()
            .collect()
    }

    /// Removes `remove`, then adds the requests whose content or time changed. Returns how many were (re)scheduled.
    pub fn apply(&self, add: &[NotifyRequest], remove: &[String], now_ms: i64) -> usize {
        let mut e = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        for id in remove {
            if e.remove(id).is_some() {
                self.delivery.cancel(id);
            }
        }
        let mut changed = 0;
        for r in add {
            if e.get(&r.identifier) == Some(r) {
                continue;
            }
            match self.delivery.schedule(r) {
                Ok(()) => {
                    e.insert(r.identifier.clone(), r.clone());
                    changed += 1;
                }
                Err(m) => crate::logging::error(&format!("notify schedule failed: {m}")),
            }
        }
        e.retain(|_, r| r.fire_at_ms > now_ms - KEEP_PAST_MS);
        let list: Vec<&NotifyRequest> = e.values().collect();
        if let Err(err) = atomic::write_json(&self.path, &list) {
            crate::logging::error(&format!("notify registry write failed: {err}"));
        }
        changed
    }

    pub fn permission(&self) -> String {
        self.delivery.permission()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as M};

    #[derive(Default)]
    struct Fake(Arc<M<Vec<String>>>);
    impl Delivery for Fake {
        fn schedule(&self, r: &NotifyRequest) -> Result<(), String> {
            self.0.lock().unwrap().push(format!("+{}", r.identifier));
            Ok(())
        }
        fn cancel(&self, id: &str) {
            self.0.lock().unwrap().push(format!("-{id}"));
        }
        fn permission(&self) -> String {
            "enabled".into()
        }
    }

    fn req(id: &str, at: i64) -> NotifyRequest {
        NotifyRequest {
            identifier: id.into(),
            kind: "item".into(),
            title: "t".into(),
            body: "b".into(),
            fire_at_ms: at,
            pin_id: Some("p".into()),
            item_id: Some("i".into()),
        }
    }

    fn state(dir: &std::path::Path) -> (NotifyState, Arc<M<Vec<String>>>) {
        let log = Arc::new(M::new(vec![]));
        (
            NotifyState::open(dir.join("notify.json"), Box::new(Fake(log.clone()))),
            log,
        )
    }

    #[test]
    fn only_changed_requests_are_rescheduled() {
        let dir = tempfile::tempdir().unwrap();
        let (s, log) = state(dir.path());
        assert_eq!(s.apply(&[req("a", 5000), req("b", 6000)], &[], 0), 2);
        assert_eq!(s.apply(&[req("a", 5000), req("b", 7000)], &[], 0), 1);
        assert_eq!(*log.lock().unwrap(), vec!["+a", "+b", "+b"]);
    }

    #[test]
    fn remove_cancels_and_pending_hides_past() {
        let dir = tempfile::tempdir().unwrap();
        let (s, log) = state(dir.path());
        s.apply(&[req("a", 5000), req("b", 100)], &[], 0);
        assert_eq!(
            s.pending(1000)
                .iter()
                .map(|r| r.identifier.as_str())
                .collect::<Vec<_>>(),
            vec!["a"]
        );
        s.apply(&[], &["a".into(), "zzz".into()], 0);
        assert!(s.pending(0).is_empty() || s.pending(0).iter().all(|r| r.identifier != "a"));
        assert!(log.lock().unwrap().contains(&"-a".to_string()));
        assert!(!log.lock().unwrap().contains(&"-zzz".to_string()));
    }

    #[test]
    fn registry_survives_a_restart_and_forgets_old_entries() {
        let dir = tempfile::tempdir().unwrap();
        let (s, _) = state(dir.path());
        s.apply(&[req("keep", 1_000_000), req("old", 10)], &[], 500_000);
        let (again, _) = state(dir.path());
        assert_eq!(again.pending(0).len(), 1);
        assert_eq!(again.pending(0)[0].identifier, "keep");
    }
}
