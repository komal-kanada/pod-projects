import { PRESET_IDS, PRESETS, type PresetId, type RunKind } from "./config";

/** Preset options for selects; presets whose run kind isn't ingested are marked. */
export function presetOptions(available: RunKind[]) {
  return PRESET_IDS.map((id: PresetId) => ({
    value: id,
    label: `${id} · ${PRESETS[id].label}${available.includes(PRESETS[id].run) ? "" : " (not ingested)"}`,
  }));
}
