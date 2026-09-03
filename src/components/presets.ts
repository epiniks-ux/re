import { Preset } from "../types";

export interface PresetLayout {
  label: string;
  description: string;
  fallbackGlyph: string;
}

const PRESETS: Record<Preset, PresetLayout> = {
  xbox: {
    label: "Xbox-style",
    description: "Diagonal icon block, bold uppercase title, slide-in banner.",
    fallbackGlyph: "\u{1F3C6}",
  },
  playstation: {
    label: "PlayStation trophy",
    description: "Dark card with a circular trophy icon and accent border.",
    fallbackGlyph: "\u{1F947}",
  },
  minimal: {
    label: "Minimal toast",
    description: "Small compact toast, single line, low profile.",
    fallbackGlyph: "\u2713",
  },
  banner: {
    label: "Full banner",
    description: "Wide banner, bigger text, good for showing off rare unlocks.",
    fallbackGlyph: "\u2605",
  },
};

export function getPresetLayout(preset: Preset): PresetLayout {
  return PRESETS[preset] || PRESETS.xbox;
}

export const PRESET_OPTIONS: { data: Preset; label: string }[] = (
  Object.keys(PRESETS) as Preset[]
).map((key) => ({ data: key, label: PRESETS[key].label }));
