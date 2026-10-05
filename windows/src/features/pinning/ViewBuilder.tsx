import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import { FilterRow } from "./FilterRow";
import styles from "./pinning.module.css";
import { SortRow } from "./SortRow";
import type { SetupForm } from "./pinning";
import { filterProperties, newFilter, newSort, sortProperties } from "./viewBuilderModel";

interface Props {
  schema: DataSourceSchema;
  form: SetupForm;
  onChange: (patch: Partial<SetupForm>) => void;
}

/** Saved-view editor: a name, AND-combined filters, sorts and "Show completed". */
export function ViewBuilder({ schema, form, onChange }: Props) {
  const replace = <T extends { id: string }>(list: T[], item: T) => list.map((x) => (x.id === item.id ? item : x));
  return (
    <div className={styles.builder}>
      <div className={styles.field}>
        <span className={styles.label}>View name</span>
        <input
          className={styles.text}
          placeholder="e.g. This week"
          aria-label="View name"
          value={form.viewName}
          onChange={(e) => onChange({ viewName: e.target.value })}
        />
      </div>
      <div className={styles.group}>
        <span className={styles.label}>Filters (all must match)</span>
        {form.filters.map((f) => (
          <FilterRow
            key={f.id}
            schema={schema}
            filter={f}
            onChange={(n) => onChange({ filters: replace(form.filters, n) })}
            onRemove={() => onChange({ filters: form.filters.filter((x) => x.id !== f.id) })}
          />
        ))}
        <button
          type="button"
          className={styles.add}
          disabled={filterProperties(schema).length === 0}
          onClick={() => {
            const f = newFilter(schema);
            if (f) onChange({ filters: [...form.filters, f] });
          }}
        >
          + Add filter
        </button>
      </div>
      <div className={styles.group}>
        <span className={styles.label}>Sort</span>
        {form.sorts.map((s) => (
          <SortRow
            key={s.id}
            schema={schema}
            sort={s}
            onChange={(n) => onChange({ sorts: replace(form.sorts, n) })}
            onRemove={() => onChange({ sorts: form.sorts.filter((x) => x.id !== s.id) })}
          />
        ))}
        <button
          type="button"
          className={styles.add}
          disabled={sortProperties(schema).length === 0}
          onClick={() => {
            const s = newSort(schema);
            if (s) onChange({ sorts: [...form.sorts, s] });
          }}
        >
          + Add sort
        </button>
      </div>
      <div className={styles.toggle}>
        <span>Show completed</span>
        <button
          type="button"
          role="switch"
          aria-checked={form.showDone}
          aria-label="Show completed"
          className={`${styles.switch} ${form.showDone ? styles.switchOn : ""}`}
          onClick={() => onChange({ showDone: !form.showDone })}
        />
      </div>
    </div>
  );
}
