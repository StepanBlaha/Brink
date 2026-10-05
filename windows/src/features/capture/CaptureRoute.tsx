import { useEffect, useMemo, useRef, useState } from "react";
import { captureText } from "../../domain/capture/inboxCapture";
import { queueSubmit, notionRetrieveDataSource } from "../../ipc/commands";
import { captureEvents, captureHide, toastShow } from "../../ipc/captureIpc";
import { on } from "../../ipc/events";
import { initState } from "../../state/bridge";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { CaptureModel } from "./captureModel";
import { CaptureView } from "./CaptureView";
import styles from "./capture.module.css";

const closeDelayMs = 180;

interface Prefill {
  text?: string;
  url?: string;
}

/** `#/capture`: the borderless window. Rust shows it (`capture_show`) and emits `capture://shown`. */
export function CaptureRoute() {
  const model = useMemo(
    () =>
      new CaptureModel({
        pins: () => usePinsStore.getState().pins,
        lastPinId: () => useSettingsStore.getState().settings.quickCaptureLastPinID,
        setLastPinId: (id) => void useSettingsStore.getState().update({ quickCaptureLastPinID: id }),
        submit: (op) => queueSubmit(op),
        retrieveDataSource: notionRetrieveDataSource,
        now: () => new Date(),
      }),
    [],
  );
  const [visible, setVisible] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const hideTimer = useRef<number>(0);

  useEffect(() => {
    const stop = initState();
    const show = () => {
      window.clearTimeout(hideTimer.current);
      model.reloadDestination();
      setVisible(true);
      setFocusToken((n) => n + 1);
    };
    const subs = [
      on(captureEvents.shown, show),
      on<Prefill>(captureEvents.prefill, (p) => {
        const kind = model.destination?.kind ?? "page";
        model.setText(captureText(p.text ?? "", p.url, kind));
      }),
    ];
    show();
    // Pins and settings hydrate after first render and change while the window lives.
    const unPins = usePinsStore.subscribe(() => model.reloadDestination());
    const unSettings = useSettingsStore.subscribe((s, prev) => {
      if (!prev.hydrated && s.hydrated) model.reloadDestination();
    });
    return () => {
      unPins();
      unSettings();
      void stop.then((f) => f());
      for (const s of subs) void s.then((f) => f());
    };
  }, [model]);

  const close = () => {
    setVisible(false);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => void captureHide(), closeDelayMs);
  };
  const cancel = () => {
    model.setText("");
    close();
  };
  const submit = async (keepOpen: boolean) => {
    const r = await model.save();
    if (r.kind === "failed") return;
    void toastShow(r.message, false);
    if (keepOpen) setFocusToken((n) => n + 1);
    else close();
  };
  return (
    <div className={styles.root}>
      <CaptureView model={model} visible={visible} focusToken={focusToken} onSubmit={(k) => void submit(k)} onCancel={cancel} />
    </div>
  );
}
