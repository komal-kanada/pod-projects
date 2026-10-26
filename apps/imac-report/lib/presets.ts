import { PRESET_IDS, PRESETS, resolveStrategy, type PresetId } from "./config";

/** Preset options for selects; presets whose run isn't ingested are marked. */
export function presetOptions(available: string[]) {
  return PRESET_IDS.map((id: PresetId) => {
    const preset = PRESETS[id];
    const key = `${resolveStrategy(preset.strategy)}:${preset.representation}`;
    const missing = preset.visual ? " (not set up)" : available.includes(key) ? "" : " (not ingested)";
    return { value: id, label: `${id} · ${preset.label}${missing}` };
  });
}
