//! Platform delivery. Windows: `ScheduledToastNotification` through the `windows` crate (the
//! notification plugin cannot schedule or add actions). Elsewhere: a logging no-op for Mac dev,
//! so the planner, registry and UI run everywhere.

use super::{Delivery, NotifyRequest};

pub fn platform() -> Box<dyn Delivery> {
    #[cfg(windows)]
    {
        Box::new(win::WinDelivery::new())
    }
    #[cfg(not(windows))]
    {
        Box::new(NoopDelivery)
    }
}

#[cfg(not(windows))]
pub struct NoopDelivery;

#[cfg(not(windows))]
impl Delivery for NoopDelivery {
    fn schedule(&self, req: &NotifyRequest) -> Result<(), String> {
        crate::logging::info(&format!(
            "notify (no-op platform): {} at {}",
            req.identifier, req.fire_at_ms
        ));
        Ok(())
    }
    fn cancel(&self, _identifier: &str) {}
    fn permission(&self) -> String {
        "enabled".into()
    }
}

#[cfg(windows)]
mod win {
    use super::super::xml::{short_tag, toast_id, toast_xml, AUMID, TODAY_PIN};
    use super::{Delivery, NotifyRequest};
    use windows::core::{Result as WinResult, HSTRING, PCWSTR};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::DateTime;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    use windows::UI::Notifications::{
        NotificationSetting, ScheduledToastNotification, ToastNotificationManager, ToastNotifier,
    };

    /// 100 ns ticks between 1601-01-01 and the Unix epoch, in ms.
    const EPOCH_MS: i64 = 11_644_473_600_000;

    pub struct WinDelivery;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Unpackaged dev runs have no Start-menu shortcut with the AUMID: register it for the user so
    /// toasts show "Brink" (the installer adds the shortcut, M10).
    fn register_aumid() {
        let key = wide(&format!("Software\\Classes\\AppUserModelId\\{AUMID}"));
        let name = wide("DisplayName");
        let value: Vec<u8> = wide("Brink").iter().flat_map(|u| u.to_le_bytes()).collect();
        unsafe {
            let mut h = HKEY::default();
            let rc = RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(key.as_ptr()),
                None,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_WRITE,
                None,
                &mut h,
                None,
            );
            if rc.is_ok() {
                let _ = RegSetValueExW(h, PCWSTR(name.as_ptr()), None, REG_SZ, Some(&value));
                let _ = RegCloseKey(h);
            }
        }
    }

    fn notifier() -> WinResult<ToastNotifier> {
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(AUMID))
    }

    impl WinDelivery {
        pub fn new() -> Self {
            register_aumid();
            Self
        }

        fn add(req: &NotifyRequest) -> WinResult<()> {
            let doc = XmlDocument::new()?;
            doc.LoadXml(&HSTRING::from(toast_xml(req)))?;
            let when = DateTime {
                UniversalTime: (req.fire_at_ms + EPOCH_MS) * 10_000,
            };
            let toast = ScheduledToastNotification::CreateScheduledToastNotification(&doc, when)?;
            toast.SetId(&HSTRING::from(toast_id(&req.identifier)))?;
            toast.SetTag(&HSTRING::from(short_tag(&req.identifier)))?;
            // Group = pinId, like `threadIdentifier`.
            let group = short_tag(req.pin_id.as_deref().unwrap_or(TODAY_PIN));
            toast.SetGroup(&HSTRING::from(group))?;
            notifier()?.AddToSchedule(&toast)
        }

        fn remove(identifier: &str) -> WinResult<()> {
            let tag = short_tag(identifier);
            let n = notifier()?;
            for t in n.GetScheduledToastNotifications()? {
                if t.Tag()? == tag.as_str() {
                    n.RemoveFromSchedule(&t)?;
                }
            }
            Ok(())
        }
    }

    impl Delivery for WinDelivery {
        fn schedule(&self, req: &NotifyRequest) -> Result<(), String> {
            let _ = Self::remove(&req.identifier);
            Self::add(req).map_err(|e| e.to_string())
        }

        fn cancel(&self, identifier: &str) {
            if let Err(e) = Self::remove(identifier) {
                crate::logging::error(&format!("notify cancel failed: {e}"));
            }
        }

        fn permission(&self) -> String {
            match notifier().and_then(|n| n.Setting()) {
                Ok(NotificationSetting::DisabledForApplication) => "disabledForApplication",
                Ok(NotificationSetting::DisabledForUser) => "disabledForUser",
                Ok(NotificationSetting::DisabledByGroupPolicy) => "disabledByGroupPolicy",
                Ok(NotificationSetting::DisabledByManifest) => "disabledByManifest",
                _ => "enabled",
            }
            .into()
        }
    }
}
