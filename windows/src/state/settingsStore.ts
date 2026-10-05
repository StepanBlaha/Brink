import { create } from "zustand";
import { settingsGet, settingsSet } from "../ipc/commands";
import { defaultSettings, withSettingDefaults, type Settings } from "../ipc/types";

interface SettingsState {
  settings: Settings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Persists a partial update through Rust; the returned whole object replaces local state. */
  update: (partial: Partial<Settings>) => Promise<void>;
  /** Applies a `settings://changed` payload (the whole object). */
  applyChanged: (payload: Partial<Settings> | null) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  hydrated: false,
  async hydrate() {
    set({ settings: await settingsGet(), hydrated: true });
  },
  async update(partial) {
    set({ settings: await settingsSet(partial), hydrated: true });
  },
  applyChanged(payload) {
    set({ settings: withSettingDefaults(payload), hydrated: true });
  },
}));
