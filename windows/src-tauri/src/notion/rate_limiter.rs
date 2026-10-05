//! Serializes outgoing requests with a minimum spacing between request starts
//! (port of RateLimiter.swift).

use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

pub struct RateLimiter {
    min_spacing: Duration,
    next_available: Mutex<Option<Instant>>,
}

impl RateLimiter {
    pub fn new(min_spacing: Duration) -> Self {
        Self {
            min_spacing,
            next_available: Mutex::new(None),
        }
    }

    /// Waits until it is this caller's turn, then reserves the next slot.
    pub async fn acquire(&self) {
        let start = {
            let mut next = self.next_available.lock().await;
            let now = Instant::now();
            let start = match *next {
                Some(n) if n > now => n,
                _ => now,
            };
            *next = Some(start + self.min_spacing);
            start
        };
        if start > Instant::now() {
            tokio::time::sleep_until(start).await;
        }
    }

    /// Pushes the next available slot out to at least `when` (after a 429's Retry-After).
    pub async fn delay_until(&self, when: Instant) {
        let mut next = self.next_available.lock().await;
        *next = Some(match *next {
            Some(n) if n > when => n,
            _ => when,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn first_acquire_is_immediate_then_spaced() {
        let l = RateLimiter::new(Duration::from_millis(340));
        let t0 = Instant::now();
        l.acquire().await;
        assert_eq!(Instant::now() - t0, Duration::ZERO);
        l.acquire().await;
        assert_eq!(Instant::now() - t0, Duration::from_millis(340));
        l.acquire().await;
        assert_eq!(Instant::now() - t0, Duration::from_millis(680));
    }

    #[tokio::test(start_paused = true)]
    async fn idle_time_resets_spacing() {
        let l = RateLimiter::new(Duration::from_millis(340));
        l.acquire().await;
        tokio::time::sleep(Duration::from_secs(2)).await;
        let t = Instant::now();
        l.acquire().await;
        assert_eq!(Instant::now() - t, Duration::ZERO);
    }

    #[tokio::test(start_paused = true)]
    async fn delay_until_pushes_next_slot() {
        let l = RateLimiter::new(Duration::from_millis(340));
        l.acquire().await;
        let t0 = Instant::now();
        l.delay_until(t0 + Duration::from_secs(1)).await;
        l.acquire().await;
        assert_eq!(Instant::now() - t0, Duration::from_secs(1));
    }

    #[tokio::test(start_paused = true)]
    async fn delay_until_never_moves_backwards() {
        let l = RateLimiter::new(Duration::from_millis(340));
        l.acquire().await;
        let t0 = Instant::now();
        l.delay_until(t0).await;
        l.acquire().await;
        assert_eq!(Instant::now() - t0, Duration::from_millis(340));
    }

    #[tokio::test(start_paused = true)]
    async fn concurrent_callers_get_distinct_slots() {
        let l = std::sync::Arc::new(RateLimiter::new(Duration::from_millis(340)));
        let t0 = Instant::now();
        let mut hs = vec![];
        for _ in 0..3 {
            let l = l.clone();
            hs.push(tokio::spawn(async move {
                l.acquire().await;
                Instant::now() - t0
            }));
        }
        let mut ds = vec![];
        for h in hs {
            ds.push(h.await.unwrap());
        }
        ds.sort();
        assert_eq!(ds[0], Duration::ZERO);
        assert_eq!(ds[1], Duration::from_millis(340));
        assert_eq!(ds[2], Duration::from_millis(680));
    }
}
