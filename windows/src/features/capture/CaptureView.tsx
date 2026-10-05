import { useEffect, useRef, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { chipText } from "../database/dates";
import { contents } from "../../theme/motion";
import { DatabaseIcon, FileTextIcon } from "../common/icons";
import type { CaptureModel } from "./captureModel";
import styles from "./capture.module.css";

interface Props {
  model: CaptureModel;
  visible: boolean;
  focusToken: number;
  /** `keepOpen` = Ctrl+Enter. */
  onSubmit: (keepOpen: boolean) => void;
  onCancel: () => void;
}

/** The quick-capture box: destination chip, text field, live date chip (plan M7). */
export function CaptureView({ model, visible, focusToken, onSubmit, onCancel }: Props) {
  useSyncExternalStore(model.subscribe, model.getVersion);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [focusToken]);

  const preview = model.datePreview;
  const dest = model.destination;
  return (
    <motion.div
      className={styles.card}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.94 }}
      transition={contents}
      style={{ transformOrigin: "top center" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className={styles.row}>
        <label className={styles.chip}>
          {dest?.kind === "dataSource" ? <DatabaseIcon width={12} height={12} /> : <FileTextIcon width={12} height={12} />}
          <span className={styles.chipText}>{dest?.title ?? (model.pins.length === 0 ? "No pins yet" : "Choose")}</span>
          <select
            className={styles.select}
            aria-label="Destination"
            value={model.destinationId ?? ""}
            onChange={(e) => model.setDestination(e.target.value)}
          >
            {model.pins.length === 0 && <option value="">No pins yet</option>}
            {model.pins.map((p) => (
              <option key={p.id} value={p.id}>{`${p.kind === "page" ? "" : "☰ "}${p.title}`}</option>
            ))}
          </select>
        </label>
        <input
          ref={input}
          className={styles.input}
          placeholder="Add to…"
          value={model.text}
          disabled={model.isSaving}
          spellCheck={false}
          onChange={(e) => model.setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit(e.ctrlKey);
            }
          }}
        />
        {preview?.date && (
          <motion.span
            className={styles.dateChip}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={contents}
          >
            {chipText(preview.date, preview.hasTime)}
          </motion.span>
        )}
      </div>
      {model.errorMessage && <p className={styles.error}>{model.errorMessage}</p>}
    </motion.div>
  );
}
