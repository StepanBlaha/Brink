import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNotchStore } from "../../state/notchStore";
import { crossfade, instant } from "../../theme/motion";
import { ignore } from "../../state/ignore";
import { useGroupsStore } from "../../state/groupsStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { DatabaseHost } from "../database/DatabaseHost";
import { PageHost } from "../../editor/PageHost";
import { ipcEngineApi, ipcEngineCache } from "../../editor/ipcEngineApi";
import { AddFlow } from "../pinning/AddFlow";
import { clampPanelSize } from "../../theme/notchMetrics";
import { TODAY_ITEM, activePins, effectiveGroupId, groupItems, isTodayId, reorderIntent, stripItems, type PinItem } from "../strip/pinItems";
import { Strip } from "../strip/Strip";
import { StripOverlay, type Overlay } from "../strip/StripOverlay";
import { ResizeGrips } from "./ResizeGrips";
import { useResize } from "./useResize";
import { toPanelPin } from "./pinAdapter";
import { NotchShape } from "./NotchShape";
import { Panel } from "./Panel";
import { PhaseBody } from "./PhaseBody";
import { Peek } from "./Peek";
import { PillProgress } from "./Pill";
import styles from "./notch.module.css";
import { useNotchBindings } from "./useNotchBindings";
import { useNotchLayout } from "./useNotchLayout";
import { useHubHandlers } from "../hub/useHubHandlers";
import { digestItems } from "../../domain/store/todayAggregator";
import { sound, itemActions } from "../../services/hub";
import { TodayHost } from "../today/TodayHost";
import { peekItemCount } from "./peekModel";
import { useSummaryView } from "./useSummaryView";
import {
  type Rect,
  insetRect,
  rectContains,
  rectMidY,
} from "./notchGeometry";
import { IconPicker } from "../iconPicker/IconPicker";
import { bodyRectFor, clampedExpandedCenter, hotRect, maxPanelSize, peekRect } from "./notchLayout";

/** The single notch window root: morphing shape, phase bodies, peek card, hit rects. */
export function NotchRoot() {
  const { config, phase: ps, hidden, nativeReduceMotion } = useNotchStore();
  const reduce = useReducedMotion() === true || nativeReduceMotion || config.reduce;
  const [iconMid, setIconMid] = useState<number | null>(null);
  const [peekIcon, setPeekIcon] = useState<Rect | null>(null);
  const storedPins = usePinsStore((s) => s.pins);
  const groups = useGroupsStore((s) => s.groups);
  const activeGroupID = useSettingsStore((s) => s.settings.activeGroupID);
  const showToday = useSettingsStore((s) => s.settings.showTodayPin);
  const items = useMemo(
    () => stripItems(activePins(storedPins, groups, activeGroupID), showToday, TODAY_ITEM),
    [storedPins, groups, activeGroupID, showToday],
  );
  const stripIds = useMemo(() => items.map((i) => i.id), [items]);
  const { summaryFor, badges, pill, digest } = useSummaryView(stripIds);
  const activeId = effectiveGroupId(groups, activeGroupID);
  const activeGroup = groupItems(groups).find((g) => g.id === activeId);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [overlayRect, setOverlayRect] = useState<Rect | null>(null);
  const [editPinId, setEditPinId] = useState<string | undefined>(undefined);
  const [iconPinId, setIconPinId] = useState<string | undefined>(undefined);
  const panelSizes = useSettingsStore((st) => st.settings.panelSizes);
  const base0 = useNotchLayout(items.length);
  const stored = ps.selectedPinId ? panelSizes[ps.selectedPinId] : undefined;
  const base = useMemo(() => {
    if (!stored) return base0;
    const max = maxPanelSize(base0);
    return { ...base0, expandedSize: clampPanelSize({ width: stored[0], height: stored[1] }, max.width, max.height) };
  }, [base0, stored]);
  const clampSize = useCallback(
    (sz: { width: number; height: number }) => {
      const max = maxPanelSize(base);
      return clampPanelSize(sz, max.width, max.height);
    },
    [base],
  );
  const commitSize = useCallback(
    (sz: { width: number; height: number }) => {
      const id = useNotchStore.getState().phase.selectedPinId;
      if (id) ignore(useSettingsStore.getState().update({ panelSizes: { ...panelSizes, [id]: [sz.width, sz.height] } }));
    },
    [panelSizes],
  );
  const resize = useResize({ edge: base.edge, size: base.expandedSize, clamp: clampSize, onCommit: commitSize });
  const sized = useMemo(() => (resize.live ? { ...base, expandedSize: resize.live } : base), [base, resize.live]);
  const layout = useMemo(
    () => ({
      ...sized,
      expandedCenter: clampedExpandedCenter(sized, iconMid ?? sized.windowSize.height / 2),
    }),
    [sized, iconMid],
  );
  const { phase } = ps;
  const selectedItem = items.find((p) => p.id === ps.selectedPinId) ?? null;
  const selectedPin = storedPins.find((p) => p.id === ps.selectedPinId);
  const selected = selectedItem ? toPanelPin(selectedItem) : null;
  useEffect(() => {
    // Debug peeks have no hover: locate the icon in the DOM.
    const el = ps.peekPinId ? document.querySelector(`[data-pin="${ps.peekPinId}"]`) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      setPeekIcon({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
  }, [ps.peekPinId]);
  const peekItem = items.find((p) => p.id === ps.peekPinId) ?? null;
  const peekPin = peekItem ? toPanelPin(peekItem) : null;
  const peekSummary = peekItem ? summaryFor(peekItem.id) : undefined;
  const peekBox = peekPin && peekIcon ? peekRect(layout, peekIcon, peekItemCount(peekSummary)) : null;

  const hitRects = useMemo(() => {
    if (hidden) return [];
    const r = [hotRect(layout, phase)];
    if (phase === "strip" && peekBox) r.push(peekBox);
    if (overlayRect) r.push(overlayRect);
    return r;
  }, [layout, phase, hidden, peekBox, overlayRect]);

  const zonesAt = useCallback(
    (x: number, y: number) => ({
      resting: rectContains(hotRect(layout, "resting"), x, y),
      strip: rectContains(hotRect(layout, "strip"), x, y),
      peek: peekBox !== null && rectContains(insetRect(peekBox, -8, -8), x, y),
    }),
    [layout, peekBox],
  );

  const overlayOpen = useRef(false);
  useEffect(() => {
    overlayOpen.current = overlay !== null;
  }, [overlay]);
  const overlayControl = useMemo(() => ({ isOpen: () => overlayOpen.current, dismiss: () => setOverlay(null) }), []);
  const machine = useNotchBindings({ layout, hitRects, zonesAt, firstPinId: items[0]?.id ?? "", overlay: overlayControl });
  useHubHandlers(machine, { onOpenAdd: () => { setEditPinId(undefined); setIconPinId(undefined); } });

  const select = (pin: { id: string }, icon: Rect) => {
    setIconMid(layout.edge === "top" ? null : rectMidY(icon));
    machine.selectPin(pin.id);
  };
  /** Menus open beside the strip, toward the screen's inside (below it on the top edge). */
  const menuAnchor = (x: number, y: number) => {
    const gap = layout.scale.stripDepth + 8;
    if (layout.edge === "top") return { x, y: gap };
    return { x: layout.edge === "right" ? layout.windowSize.width - gap : gap, y };
  };
  const addPin = (icon: Rect) => {
    setIconMid(layout.edge === "top" ? null : rectMidY(icon));
    setEditPinId(undefined);
    setIconPinId(undefined);
    machine.openAddFlow();
  };
  const reorder = (item: PinItem, stripIndex: number) => {
    const intent = reorderIntent(item, stripIndex, showToday, activeId);
    if (intent) ignore(usePinsStore.getState().move(intent.pinId, intent.toIndex, intent.groupId));
  };
  const ratio = pill.ratio;
  /** Ticking in the peek: Today items belong to whichever pin they came from. */
  const checkPeekItem = (pinId: string, itemId: string) => {
    const owner = isTodayId(pinId) ? digestItems(digest).find((i) => i.id === itemId)?.pinId : pinId;
    sound.tick();
    if (owner) void itemActions.markDone(owner, itemId);
  };

  const shapeVisible = !(phase === "resting" && layout.pillStyle === "hidden");
  const rail = (animate: boolean, group: boolean) => (
    <Strip
      items={items}
      activeGroup={activeGroup}
      edge={layout.edge}
      scale={layout.scale}
      selectedId={ps.selectedPinId}
      badges={badges}
      animate={animate}
      reduce={reduce}
      showGroupSwitcher={group}
      onSelect={select}
      onAdd={addPin}
      onReorder={reorder}
      onContextMenu={(item, x, y) => setOverlay({ kind: "pin", pinId: item.id, ...menuAnchor(x, y) })}
      onGroupMenu={(r) => setOverlay({ kind: "groups", ...menuAnchor(r.x, r.y) })}
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
      {ps.addFlow && iconPinId ? (
        <IconPicker pinId={iconPinId} onClose={() => { setIconPinId(undefined); machine.collapse(true); }} />
      ) : ps.addFlow ? (
        <AddFlow editPinId={editPinId} onClose={() => machine.collapse(true)} />
      ) : (
      <Panel
        pin={selected}
        addFlow={false}
        keepOpen={ps.keepOpen}
        fontScale={layout.fontScale}
        onToggleKeepOpen={() => machine.toggleKeepOpen()}
        onClose={() => machine.collapse(true)}
      >
        {isTodayId(ps.selectedPinId) ? <TodayHost reduce={reduce} /> : selectedPin?.kind === "dataSource" && selectedPin.config ? <DatabaseHost pin={selectedPin} /> : selectedPin?.kind === "page" ? <PageHost pageId={selectedPin.notionId} api={ipcEngineApi} cache={ipcEngineCache(selectedPin.id)} fontScale={layout.fontScale} /> : null}
      </Panel>
      )}
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
      <NotchShape layout={layout} phase={phase} reduce={reduce || resize.resizing} outline={config.outline} visible={shapeVisible}>
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
                  {pill.label}
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
            title={peekPin.title}
            summary={peekSummary}
            rect={peekBox}
            edge={layout.edge}
            fontScale={layout.fontScale}
            reduce={reduce}
            onHover={(h) => machine.peekCardHover(h)}
            onOpen={() => peekIcon && select(peekPin, peekIcon)}
            onCheck={(itemId) => checkPeekItem(peekPin.id, itemId)}
          />
        )}
      </AnimatePresence>
      {phase === "expanded" && !ps.addFlow && ps.selectedPinId && (
        <ResizeGrips
          edge={layout.edge}
          rect={bodyRectFor(layout, "expanded")}
          onBegin={resize.begin}
          onReset={() => {
            const { [ps.selectedPinId as string]: _gone, ...rest } = panelSizes;
            void _gone;
            ignore(useSettingsStore.getState().update({ panelSizes: rest }));
          }}
        />
      )}
      {overlay && (
        <StripOverlay
          overlay={overlay}
          edge={layout.edge}
          keptOpenPinId={ps.keepOpen ? ps.selectedPinId : null}
          onKeepOpen={(id) => {
            if (!(phase === "expanded" && ps.selectedPinId === id)) machine.selectPin(id);
            if (!machine.state.keepOpen) machine.toggleKeepOpen();
          }}
          onEditView={(id) => {
            setEditPinId(id);
            setIconPinId(undefined);
            machine.openAddFlow();
          }}
          onChangeIcon={(id) => {
            setIconPinId(id);
            setEditPinId(undefined);
            machine.openAddFlow();
          }}
          onUnpinned={(id) => ps.selectedPinId === id && machine.collapse(true)}
          onRect={setOverlayRect}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
