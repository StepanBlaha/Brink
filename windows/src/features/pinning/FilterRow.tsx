import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import {
  operatorDisplayName, operatorNeedsMultipleOptions, operatorNeedsValue, operatorPropertyType, type ViewFilter,
} from "../../domain/notion/viewFilter";
import { XIcon } from "../notch/icons";
import styles from "./pinning.module.css";
import {
  changeFilterOperator, changeFilterProperty, filterProperties, operatorsFor, parseNumber, toggleFilterOption,
} from "./viewBuilderModel";
import { useState } from "react";

interface Props {
  schema: DataSourceSchema;
  filter: ViewFilter;
  onChange: (f: ViewFilter) => void;
  onRemove: () => void;
}

function NumberField({ value, onChange }: { value: number | undefined; onChange: (n: number | undefined) => void }) {
  // Keeps its own text so partial input like "1." is not clobbered.
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <input
      className={styles.text}
      inputMode="decimal"
      placeholder="Number"
      aria-label="Number"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
    />
  );
}

/** One filter: property and operator pickers, then the value editor its operator needs. */
export function FilterRow({ schema, filter: f, onChange, onRemove }: Props) {
  const prop = schema.properties.find((p) => p.name === f.property);
  const type = operatorPropertyType(f.op);
  const options = (type === "status" ? prop?.statusOptions : prop?.selectOptions) ?? [];
  const multiple = operatorNeedsMultipleOptions(f.op);
  return (
    <div className={styles.card} data-filter={f.id}>
      <div className={styles.cardRow}>
        <select
          className={styles.pill}
          aria-label="Filter property"
          value={f.property}
          onChange={(e) => {
            const p = schema.properties.find((x) => x.name === e.target.value);
            if (p) onChange(changeFilterProperty(f, p));
          }}
        >
          {!prop && <option value={f.property}>{f.property || "Property"}</option>}
          {filterProperties(schema).map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select
          className={styles.pill}
          aria-label="Filter operator"
          value={f.op}
          onChange={(e) => onChange(changeFilterOperator(f, e.target.value as ViewFilter["op"]))}
        >
          {operatorsFor(schema, f).map((op) => (
            <option key={op} value={op}>{operatorDisplayName(op)}</option>
          ))}
        </select>
        <span className={styles.spacer} />
        <button type="button" className={styles.iconBtn} title="Remove" aria-label="Remove filter" onClick={onRemove}>
          <XIcon width={11} height={11} />
        </button>
      </div>
      {operatorNeedsValue(f.op) && (type === "status" || type === "select") && (
        <div className={styles.chips}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={f.optionValues?.includes(o.name) ?? false}
              className={`${styles.chip} ${f.optionValues?.includes(o.name) ? styles.chipOn : ""}`}
              onClick={() => onChange(toggleFilterOption(f, o.name, multiple))}
            >
              {o.name}
            </button>
          ))}
          {options.length === 0 && <span className={styles.hint}>No options</span>}
        </div>
      )}
      {operatorNeedsValue(f.op) && type === "number" && (
        <NumberField value={f.numberValue} onChange={(n) => onChange(omit(f, "numberValue", n))} />
      )}
      {operatorNeedsValue(f.op) && type === "title" && (
        <input
          className={styles.text}
          placeholder="Text"
          aria-label="Text"
          value={f.textValue ?? ""}
          onChange={(e) => onChange({ ...f, textValue: e.target.value })}
        />
      )}
    </div>
  );
}

function omit(f: ViewFilter, key: "numberValue", value: number | undefined): ViewFilter {
  const { [key]: _drop, ...rest } = f;
  void _drop;
  return value === undefined ? rest : { ...rest, [key]: value };
}
