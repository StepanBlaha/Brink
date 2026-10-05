import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNotchStore } from "../../state/notchStore";
import { crossfade, instant } from "../../theme/motion";
import { FAKE_PINS, type FakePin } from "./fakePins";
import { NotchShape } from "./NotchShape";
import { Panel } from "./Panel";
import { PhaseBody } from "./PhaseBody";
import { Peek } from "./Peek";
import { PillProgress } from "./Pill";
import { Strip } from "./Strip";
import styles from "./notch.module.css";
import { useNotchBindings } from "./useNotchBindings";
import { useNotchLayout } from "./useNotchLayout";
import {
  type Rect,
  insetRect,
  rectContains,
  rectMidY,
} from "./notchGeometry";
import { bodyRectFor, clampedExpandedCenter, hotRect, peekRect } from "./notchLayout";

const PEEK_ITEMS = 3;

/** The single notch window root: morphing shape, phase bodies, peek card, hit rects. */
export function NotchRoot() {
  const { config, phase: ps, hidden, nativeReduceMotion } = useNotchStore();
  const reduce = useReducedMotion() === true || nativeReduceMotion || config.reduce;
  const [iconMid, setIconMid] = useState<number | null>(null);
  const [peekIcon, setPeekIcon] = useState<Rect | null>(null);
  const base = useNotchLayout();
  const layout = useMemo(
    () => ({
      ...base,
      expandedCenter: clampedExpandedCenter(base, iconMid ?? base.windowSize.height / 2),
    }),
    [base, iconMid],
  );
  const { phase } = ps;
  const pins = FAKE_PINS.slice(0, layout.pinCount);
  const selected = pins.find((p) => p.id === ps.selectedPinId) ?? null;
  const peekPin = pins.find((p) => p.id === ps.peekPinId) ?? null;
  const peekBox = peekPin && peekIcon ? peekRect(layout, peekIcon, PEEK_ITEMS) : null;

  const hitRects = useMemo(() => {
    if (hidden) return [];
    const r = [hotRect(layout, phase)];
    if (phase === "strip" && peekBox) r.push(peekBox);
    return r;
  }, [layout, phase, hidden, peekBox]);

  const zonesAt = useCallback(
    (x: number, y: number) => ({
      resting: rectContains(hotRect(layout, "resting"), x, y),
      strip: rectContains(hotRect(layout, "strip"), x, y),
      peek: peekBox !== null && rectContains(insetRect(peekBox, -8, -8), x, y),
    }),
    [layout, peekBox],
  );

  const machine = useNotchBindings({ layout, hitRects, zonesAt, firstPinId: pins[0]?.id ?? "" });

  const select = (pin: FakePin, icon: Rect) => {
    setIconMid(layout.edge === "top" ? null : rectMidY(icon));
    machine.selectPin(pin.id);
  };
  const ratio = useMemo(() => {
    const total = pins.reduce((a, p) => a + p.total, 0);
    return total === 0 ? null : (total - pins.reduce((a, p) => a + p.open, 0)) / total;
  }, [pins]);

  const shapeVisible = !(phase === "resting" && layout.pillStyle === "hidden");
  const rail = (animate: boolean, group: boolean) => (
    <Strip
      pins={pins}
      edge={layout.edge}
      scale={layout.scale}
      selectedId={ps.selectedPinId}
      animate={animate}
      reduce={reduce}
      showGroupSwitcher={group}
      onSelect={select}
      onAdd={() => machine.openAddFlow()}
      onPeekEnter={
        group
          ? (pin, icon) => {
              setPeekIcon(icon);
              machine.peekEnter(pin.id);
            }
          : undefined
      }
      onPeekLeave={group ? () => machine.peekLeave() : undefined}
    />
  );
  const panel = (
    <motion.div
      key={ps.addFlow ? "add" : (ps.selectedPinId ?? "none")}
      style={{ width: "100%", height: "100%" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? instant : crossfade}
    >
      <Panel
        pin={selected}
        addFlow={ps.addFlow}
        keepOpen={ps.keepOpen}
        fontScale={layout.fontScale}
        onToggleKeepOpen={() => machine.toggleKeepOpen()}
        onClose={() => machine.collapse(true)}
      />
    </motion.div>
  );
  const railSize = layout.scale.stripDepth;
  const divider = <div style={{ background: "var(--divider)", flex: "none", [layout.edge === "top" ? "height" : "width"]: 1 }} />;
  const expanded = (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: layout.edge === "top" ? "column" : layout.edge === "left" ? "row" : "row-reverse",
      }}
    >
      <div style={{ flex: "none", [layout.edge === "top" ? "height" : "width"]: railSize }}>{rail(false, false)}</div>
      {divider}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{panel}</div>
    </div>
  );

  return (
    <div
      className={`${styles.root} ${config.backdrop ? styles.backdrop : ""} ${hidden ? styles.hiddenAll : ""}`}
      data-phase={phase}
      data-edge={layout.edge}
    >
      <NotchShape layout={layout} phase={phase} reduce={reduce} outline={config.outline} visible={shapeVisible}>
        <PillProgress
          rect={bodyRectFor(layout, "resting")}
          edge={layout.edge}
          style={layout.pillStyle}
          ratio={ratio}
          s={layout.scale.s}
          visible={phase === "resting"}
          reduce={reduce}
        />
        <AnimatePresence>
          <PhaseBody key={phase} rect={bodyRectFor(layout, phase)} edge={layout.edge} reduce={reduce}>
            {phase === "resting" ? (
              layout.pillStyle === "percent" ? (
                <div className={styles.pillLabel} style={{ fontSize: 10 * layout.fontScale }}>
                  {Math.round((ratio ?? 0) * 100)}%
                </div>
              ) : null
            ) : phase === "strip" ? (
              rail(true, true)
            ) : (
              expanded
            )}
          </PhaseBody>
        </AnimatePresence>
      </NotchShape>
      <AnimatePresence>
        {phase === "strip" && peekPin && peekBox && (
          <Peek
            key={peekPin.id}
            pin={peekPin}
            rect={peekBox}
            edge={layout.edge}
            fontScale={layout.fontScale}
            reduce={reduce}
            onHover={(h) => machine.peekCardHover(h)}
            onOpen={() => peekIcon && select(peekPin, peekIcon)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
