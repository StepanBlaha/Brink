import styles from "./Press.module.css";

const colors = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Accent blue", hex: "#0A84FF" },
  { name: "Raised", hex: "#1C1C1E" },
  { name: "Secondary", hex: "#808080" },
  { name: "Success", hex: "#00FF88" },
  { name: "Danger", hex: "#FF453A" },
];

export function Colors() {
  return (
    <>
      <h2>Colors</h2>
      <div className={styles.swRow}>
        {colors.map((c) => (
          <div key={c.hex} className={styles.sw}>
            <i style={{ background: c.hex, borderBottom: c.hex === "#000000" ? "1px solid var(--line)" : undefined }} />
            <div><b>{c.name}</b>{c.hex}</div>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 14 }}>Type: the system font (SF Pro).</p>
    </>
  );
}
