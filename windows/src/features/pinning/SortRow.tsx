import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import type { ViewSort } from "../../domain/notion/viewFilter";
import { XIcon } from "../notch/icons";
import styles from "./pinning.module.css";
import { sortProperties } from "./viewBuilderModel";

interface Props {
  schema: DataSourceSchema;
  sort: ViewSort;
  onChange: (s: ViewSort) => void;
  onRemove: () => void;
}

export function SortRow({ schema, sort, onChange, onRemove }: Props) {
  const known = schema.properties.some((p) => p.name === sort.property);
  return (
    <div className={styles.card} data-sort={sort.id}>
      <div className={styles.cardRow}>
        <select
          className={styles.pill}
          aria-label="Sort property"
          value={sort.property}
          onChange={(e) => onChange({ ...sort, property: e.target.value })}
        >
          {!known && <option value={sort.property}>{sort.property || "Property"}</option>}
          {sortProperties(schema).map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select
          className={styles.pill}
          aria-label="Sort direction"
          value={sort.ascending ? "asc" : "desc"}
          onChange={(e) => onChange({ ...sort, ascending: e.target.value === "asc" })}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <span className={styles.spacer} />
        <button type="button" className={styles.iconBtn} title="Remove" aria-label="Remove sort" onClick={onRemove}>
          <XIcon width={11} height={11} />
        </button>
      </div>
    </div>
  );
}
