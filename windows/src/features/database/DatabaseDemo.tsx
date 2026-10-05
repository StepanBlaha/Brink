import { useMemo } from "react";
import { DatabaseModel } from "./databaseModel";
import { DatabaseTaskView } from "./DatabaseTaskView";
import { createFake, sprintRow, sprintSchema } from "./fakePorts";
import styles from "./demo.module.css";

function demoRows() {
  const d = (n: number) => {
    const t = new Date();
    t.setDate(t.getDate() + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  return [
    sprintRow("1", "Fix login redirect", { due: d(-2), status: "In progress" }),
    sprintRow("2", "Write release notes", { due: `${d(0)}T15:30:00+00:00` }),
    sprintRow("3", "Review pull requests", { due: d(1), status: "In progress" }),
    sprintRow("4", "Update dependencies", { due: d(4) }),
    sprintRow("5", "Plan next sprint"),
    sprintRow("6", "Ship the notch window", { done: true, due: d(-1), status: "Done" }),
  ];
}

/** Browser-only page (`#/dbdemo`, add `?compact=1`): the Sprint database on in-memory ports. */
export function DatabaseDemo() {
  const compact = new URLSearchParams(window.location.search).has("compact");
  const model = useMemo(() => {
    const fake = createFake(demoRows());
    return new DatabaseModel("ds-sprint", { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false }, "demo", fake.ports, sprintSchema);
  }, []);
  return (
    <div className={styles.stage}>
      <div className={`${styles.panel} ${compact ? "" : styles.fixed}`}>
        <DatabaseTaskView model={model} compact={compact} />
      </div>
    </div>
  );
}
