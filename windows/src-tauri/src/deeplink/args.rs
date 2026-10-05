//! Pure parsing of launch arguments and shared files (plan 3.l).

use crate::capture::Prefill;

pub const SHARE_LIMIT: usize = 64 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub enum ArgAction {
    Url(String),
    Capture,
    Settings,
    Share(String),
}

fn is_brink_url(s: &str) -> bool {
    s.get(..8)
        .is_some_and(|p| p.eq_ignore_ascii_case("brink://"))
}

/// `args` excludes the executable name.
pub fn parse_args(args: &[String]) -> Vec<ArgAction> {
    let mut out = Vec::new();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--capture" => out.push(ArgAction::Capture),
            "--settings" => out.push(ArgAction::Settings),
            "--share" => {
                if let Some(p) = it.next().filter(|p| !p.is_empty()) {
                    out.push(ArgAction::Share(p.clone()));
                }
            }
            s if is_brink_url(s) => out.push(ArgAction::Url(s.to_string())),
            _ => {}
        }
    }
    out
}

/// Longest prefix of `s` that fits in `max` bytes and ends on a char boundary.
pub fn truncate_on_boundary(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// `.url` files (InternetShortcut): the `URL=` line becomes the url, text stays empty.
/// Anything else is plain text, capped at 64 KB. Handles a UTF-8 BOM and invalid bytes.
pub fn share_prefill(bytes: &[u8], is_url_file: bool) -> Prefill {
    let all = String::from_utf8_lossy(bytes);
    let content = all.strip_prefix('\u{feff}').unwrap_or(&all);
    if is_url_file {
        let url = content
            .lines()
            .find_map(|l| {
                let l = l.trim();
                l.get(..4)
                    .filter(|p| p.eq_ignore_ascii_case("url="))
                    .map(|_| l[4..].trim().to_string())
            })
            .unwrap_or_default();
        return Prefill {
            text: String::new(),
            url,
        };
    }
    Prefill {
        text: truncate_on_boundary(content, SHARE_LIMIT).to_string(),
        url: String::new(),
    }
}

/// Reads at most 64 KB (plus a char of slack) and builds the prefill.
pub fn read_share(path: &str) -> Option<Prefill> {
    use std::io::Read;
    let mut buf = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(SHARE_LIMIT as u64 + 4)
        .read_to_end(&mut buf)
        .ok()?;
    let is_url = path.to_ascii_lowercase().ends_with(".url");
    Some(share_prefill(&buf, is_url))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_flags_and_urls() {
        assert_eq!(
            parse_args(&v(&["--capture", "brink://pin/abc", "--settings"])),
            vec![
                ArgAction::Capture,
                ArgAction::Url("brink://pin/abc".into()),
                ArgAction::Settings
            ]
        );
        assert_eq!(
            parse_args(&v(&["--share", "C:\\a b\\n.txt"])),
            vec![ArgAction::Share("C:\\a b\\n.txt".into())]
        );
        assert_eq!(
            parse_args(&v(&["BRINK://capture?text=Milk"])),
            vec![ArgAction::Url("BRINK://capture?text=Milk".into())]
        );
    }

    #[test]
    fn ignores_noise_and_dangling_share() {
        assert!(parse_args(&v(&["--autostart", "https://x.y", "--share"])).is_empty());
        assert!(parse_args(&v(&["--share", ""])).is_empty());
    }

    #[test]
    fn truncates_on_a_char_boundary() {
        let s = "a".repeat(SHARE_LIMIT - 1) + "é";
        let t = share_prefill(s.as_bytes(), false).text;
        assert_eq!(t.len(), SHARE_LIMIT - 1);
        assert!(t.chars().all(|c| c == 'a'));
        let short = share_prefill("héllo".as_bytes(), false);
        assert_eq!(short.text, "héllo");
    }

    #[test]
    fn exact_limit_is_kept() {
        let s = "b".repeat(SHARE_LIMIT + 10);
        assert_eq!(share_prefill(s.as_bytes(), false).text.len(), SHARE_LIMIT);
    }

    #[test]
    fn url_file_takes_the_url_line() {
        let f = "\u{feff}[InternetShortcut]\r\nurl = x\r\nURL=https://example.com/a?b=1\r\nIconIndex=0\r\n";
        let p = share_prefill(f.as_bytes(), true);
        assert_eq!(p.url, "https://example.com/a?b=1");
        assert_eq!(p.text, "");
        assert_eq!(share_prefill(b"[InternetShortcut]", true).url, "");
    }

    #[test]
    fn text_file_has_no_url_and_survives_bad_bytes() {
        let p = share_prefill(b"ok \xff\xfe end", false);
        assert!(p.text.starts_with("ok "));
        assert_eq!(p.url, "");
    }
}
