use brink_lib::store::backup::{write_backup, KEEP_PER_PAGE};

fn count(dir: &std::path::Path, prefix: &str) -> usize {
    let mut n = 0;
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        if entry.file_name().to_string_lossy().starts_with(prefix) {
            n += 1;
        }
    }
    n
}

#[test]
fn writes_markdown_named_by_page_and_timestamp() {
    let d = tempfile::tempdir().unwrap();
    let dir = d.path().join("backups");
    let p = write_backup(&dir, "abc-123", "# Title\n- [ ] a", 1700).unwrap();
    let name = p.file_name().unwrap().to_string_lossy().to_string();
    assert_eq!(name, "abc-123-0000000000001700.md");
    assert_eq!(std::fs::read_to_string(p).unwrap(), "# Title\n- [ ] a");
}

#[test]
fn keeps_only_the_newest_twenty_per_page() {
    let d = tempfile::tempdir().unwrap();
    let dir = d.path().join("backups");
    for t in 0..(KEEP_PER_PAGE as u128 + 7) {
        write_backup(&dir, "pageA", &format!("v{t}"), t + 1).unwrap();
    }
    write_backup(&dir, "pageB", "other", 5).unwrap();
    assert_eq!(count(&dir, "pageA-"), KEEP_PER_PAGE);
    assert_eq!(count(&dir, "pageB-"), 1);
    let newest = dir.join("pageA-0000000000000027.md");
    assert_eq!(std::fs::read_to_string(newest).unwrap(), "v26");
    assert!(!dir.join("pageA-0000000000000001.md").exists());
}

#[test]
fn same_millisecond_does_not_overwrite_and_bad_ids_are_sanitized() {
    let d = tempfile::tempdir().unwrap();
    let dir = d.path().join("backups");
    write_backup(&dir, "p", "one", 9).unwrap();
    write_backup(&dir, "p", "two", 9).unwrap();
    assert_eq!(count(&dir, "p-"), 2);
    let p = write_backup(&dir, "../evil/id", "x", 9).unwrap();
    assert_eq!(p.parent().unwrap(), dir);
    assert!(write_backup(&dir, "///", "x", 9).is_err());
}
