import { ChevronLeftIcon } from "../common/icons";
import { XIcon } from "../notch/icons";
import styles from "./pinning.module.css";

interface Props {
  title: string;
  onBack?: (() => void) | undefined;
  onClose: () => void;
}

/** Header shared by the add-a-pin steps: optional back button, title, close. */
export function AddFlowHeader({ title, onBack, onClose }: Props) {
  return (
    <header className={styles.header}>
      {onBack && (
        <button type="button" className={styles.iconBtn} title="Back" aria-label="Back" onClick={onBack}>
          <ChevronLeftIcon width={14} height={14} />
        </button>
      )}
      <span className={styles.title}>{title}</span>
      <button type="button" className={styles.iconBtn} title="Close" aria-label="Close" onClick={onClose}>
        <XIcon width={14} height={14} />
      </button>
    </header>
  );
}
