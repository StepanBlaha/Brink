/// The build number is the `(N)` in the repo's `VERSION` ("0.10.0 (2)"); About shows it.
fn build_number(version: &str) -> String {
    version
        .split_once('(')
        .and_then(|(_, rest)| rest.split_once(')'))
        .map(|(n, _)| n.trim().to_string())
        .filter(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or_else(|| "1".to_string())
}

fn main() {
    println!("cargo:rerun-if-changed=../../VERSION");
    let raw = std::fs::read_to_string("../../VERSION").unwrap_or_default();
    println!("cargo:rustc-env=BRINK_BUILD={}", build_number(&raw));
    tauri_build::build()
}
