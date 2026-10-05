import { useEffect, useState } from "react";
import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import type { DatabaseConfig } from "../../domain/store/pin";
import { AddFlowHeader } from "./AddFlowHeader";
import {
  canSave, configToForm, dateCandidates, doneCandidates, emptyForm, formToConfig, type SetupForm,
} from "./pinning";
import styles from "./pinning.module.css";
import { errorMessage } from "./usePinSearch";
import { ViewBuilder } from "./ViewBuilder";

interface Props {
  title: string;
  loadSchema: () => Promise<DataSourceSchema>;
  onSave: (config: DatabaseConfig) => void;
  onCancel: () => void;
  /** Prefills every field when editing a pin's view. */
  initialConfig?: DatabaseConfig | undefined;
  saveLabel?: string;
  /** Set when reached from the search step. */
  onBack?: (() => void) | undefined;
}

/** After picking a database: which property means done, an optional date, and View options. */
export function DatabaseSetup({ title, loadSchema, onSave, onCancel, initialConfig, saveLabel = "Pin database", onBack }: Props) {
  const [schema, setSchema] = useState<DataSourceSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SetupForm>(emptyForm);
  const [viewOpen, setViewOpen] = useState(false);
  const patch = (p: Partial<SetupForm>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    let stale = false;
    loadSchema().then(
      (s) => {
        if (stale) return;
        setSchema(s);
        if (initialConfig) setForm(configToForm(s, initialConfig));
      },
      (e) => !stale && setError(errorMessage(e, "Failed to load database.")),
    );
    return () => {
      stale = true;
    };
    // The schema loads once per mount; the caller remounts this step for another database.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = schema?.properties.find((p) => p.id === form.doneId);
  const dones = doneCandidates(schema);
  const save = () => {
    const config = schema ? formToConfig(schema, form) : null;
    if (config) onSave(config);
  };

  return (
    <div className={styles.flow}>
      <AddFlowHeader title={title === "" ? "Untitled" : title} onBack={onBack} onClose={onCancel} />
      {error ? (
        <div className={`${styles.center} ${styles.error}`} role="alert">{error}</div>
      ) : !schema ? (
        <div className={styles.center} role="status">Loading…</div>
      ) : (
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Which property means done?</span>
            <select
              className={styles.select}
              value={form.doneId ?? ""}
              onChange={(e) => {
                const next = e.target.value === "" ? null : e.target.value;
                const initial = schema.properties.find((p) => p.name === initialConfig?.doneProperty);
                patch({ doneId: next, doneStatus: next !== null && next === initial?.id ? (initialConfig?.doneValue ?? null) : null });
              }}
            >
              <option value="">Choose…</option>
              {dones.map((p) => (
                <option key={p.id} value={p.id}>{`${p.name} (${p.type})`}</option>
              ))}
            </select>
          </label>
          {done?.type === "status" && (
            <label className={styles.field}>
              <span className={styles.label}>Which status option means done?</span>
              <select
                className={styles.select}
                value={form.doneStatus ?? ""}
                onChange={(e) => patch({ doneStatus: e.target.value === "" ? null : e.target.value })}
              >
                <option value="">Choose…</option>
                {(done.statusOptions ?? []).map((o) => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.field}>
            <span className={styles.label}>Date property (optional)</span>
            <select className={styles.select} value={form.dateId ?? ""} onChange={(e) => patch({ dateId: e.target.value === "" ? null : e.target.value })}>
              <option value="">None</option>
              {dateCandidates(schema).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          {dones.length === 0 && (
            <p className={styles.hint}>This database has no checkbox or status property, so there's no way to mark rows done.</p>
          )}
          <button type="button" className={styles.disclose} aria-expanded={viewOpen} onClick={() => setViewOpen((o) => !o)}>
            <span className={`${styles.chev} ${viewOpen ? styles.chevOpen : ""}`}>›</span>
            View options
          </button>
          {viewOpen && <ViewBuilder schema={schema} form={form} onChange={patch} />}
          <button type="button" className={styles.primary} disabled={!canSave(schema, form)} onClick={save}>
            {saveLabel}
          </button>
        </div>
      )}
    </div>
  );
}
