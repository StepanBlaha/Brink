import type { ReactNode } from "react";
import styles from "./controls.module.css";

export function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldTitle}>{title}</div>
      {children}
    </div>
  );
}

export const Hint = ({ children }: { children: ReactNode }) => <p className={styles.hint}>{children}</p>;

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  maxWidth?: number;
}

/** Segmented picker (radio group): arrow keys move the choice. */
export function Segmented<T extends string>({ label, value, options, onChange, maxWidth = 320 }: SegmentedProps<T>) {
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (d === 0) return;
    e.preventDefault();
    const next = options[(i + d + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <div role="radiogroup" aria-label={label} className={styles.segmented} style={{ maxWidth }}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={`${styles.seg} ${o.value === value ? styles.segOn : ""}`}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => move(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Extra controls on the same row (the Sounds "Test" button). */
  children?: ReactNode;
}

export function Toggle({ label, checked, onChange, disabled, children }: ToggleProps) {
  return (
    <div className={styles.toggleRow}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`${styles.switch} ${checked ? styles.switchOn : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
        <span className={styles.srOnly}>{label}</span>
      </button>
      <span className={disabled ? styles.dim : undefined} aria-hidden>{label}</span>
      {children}
    </div>
  );
}

export function Button(p: { children: ReactNode; onClick: () => void; kind?: "primary" | "plain" | "danger"; disabled?: boolean }) {
  const kind = p.kind ?? "plain";
  return (
    <button type="button" className={`${styles.btn} ${styles[kind]}`} disabled={p.disabled} onClick={p.onClick}>
      {p.children}
    </button>
  );
}
