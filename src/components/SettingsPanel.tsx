import { VFC, useEffect, useState, useCallback, useRef } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  ToggleField,
  SliderField,
  DropdownItem,
  TextField,
  Field,
} from "@decky/ui";
import { callable } from "@decky/api";
import { Settings, Position, Animation, FontFamily } from "../types";
import { PRESET_OPTIONS } from "./presets";

const getSettings = callable<[], Settings>("get_settings");
const setSettingsCall = callable<[Partial<Settings>], Settings>("set_settings");
const listSounds = callable<[], string[]>("list_sounds");
const testNotification = callable<[boolean], void>("test_notification");
const getStatus = callable<[], any>("get_status");

const POSITION_OPTIONS: { data: Position; label: string }[] = [
  { data: "top-left", label: "Top left" },
  { data: "top-center", label: "Top center" },
  { data: "top-right", label: "Top right" },
  { data: "bottom-left", label: "Bottom left" },
  { data: "bottom-center", label: "Bottom center" },
  { data: "bottom-right", label: "Bottom right" },
];

const ANIMATION_OPTIONS: { data: Animation; label: string }[] = [
  { data: "slide", label: "Slide in" },
  { data: "fade", label: "Fade in" },
  { data: "pop", label: "Pop / scale in" },
];

const FONT_OPTIONS: { data: FontFamily; label: string }[] = [
  { data: "system", label: "System (Motiva Sans)" },
  { data: "rounded", label: "Rounded" },
  { data: "mono", label: "Monospace" },
  { data: "condensed", label: "Condensed" },
  { data: "serif", label: "Serif" },
];

export const SettingsPanel: VFC = () => {
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [sounds, setSounds] = useState<string[]>([]);
  const [status, setStatus] = useState<any>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    getSettings().then(setSettingsState).catch(() => {});
    listSounds().then(setSounds).catch(() => {});
    getStatus().then(setStatus).catch(() => {});
  }, []);

  const patch = useCallback((partial: Partial<Settings>) => {
    setSettingsState((prev) => (prev ? { ...prev, ...partial } : prev));
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSettingsCall(partial).catch(() => {});
    }, 150);
  }, []);

  if (!settings) {
    return (
      <PanelSection>
        <PanelSectionRow>Loading settings...</PanelSectionRow>
      </PanelSection>
    );
  }

  const soundOptions = (fallback: string) =>
    (sounds.length ? sounds : [fallback]).map((s) => ({ data: s, label: s }));

  return (
    <>
      <PanelSection title="General">
        <PanelSectionRow>
          <ToggleField
            label="Enabled"
            description="Turn achievement popups on or off"
            checked={settings.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <TextField
            label="Steam Web API key"
            description="Free key from steamcommunity.com/dev/apikey. Needed for names, icons and rarity - without it you'll only get a generic popup."
            value={settings.steam_api_key}
            onChange={(e) => patch({ steam_api_key: e.target.value })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <TextField
            label="SteamID64 override (optional)"
            description="Leave blank to auto-detect the most recently used profile on this deck."
            value={settings.steam_id64}
            onChange={(e) => patch({ steam_id64: e.target.value })}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Style">
        <PanelSectionRow>
          <DropdownItem
            label="Preset"
            rgOptions={PRESET_OPTIONS}
            selectedOption={settings.preset}
            onChange={(o) => patch({ preset: o.data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Position"
            rgOptions={POSITION_OPTIONS}
            selectedOption={settings.position}
            onChange={(o) => patch({ position: o.data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Animation"
            rgOptions={ANIMATION_OPTIONS}
            selectedOption={settings.animation}
            onChange={(o) => patch({ animation: o.data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Font"
            rgOptions={FONT_OPTIONS}
            selectedOption={settings.font_family}
            onChange={(o) => patch({ font_family: o.data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField
            label="Duration"
            value={settings.duration_seconds}
            min={2}
            max={15}
            step={1}
            notchTicksVisible
            valueSuffix="s"
            onChange={(v) => patch({ duration_seconds: v })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField
            label="Size"
            value={settings.scale_percent}
            min={50}
            max={150}
            step={10}
            notchTicksVisible
            valueSuffix="%"
            onChange={(v) => patch({ scale_percent: v })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Show achievement icon"
            checked={settings.show_icon}
            onChange={(v) => patch({ show_icon: v })}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Rarity">
        <PanelSectionRow>
          <SliderField
            label="Rare threshold"
            description="Achievements unlocked by this % of players (globally) or fewer get the rare style + sound"
            value={settings.rarity_threshold_percent}
            min={0}
            max={50}
            step={1}
            notchTicksVisible
            valueSuffix="%"
            onChange={(v) => patch({ rarity_threshold_percent: v })}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Sound">
        <PanelSectionRow>
          <SliderField
            label="Volume"
            value={settings.volume_percent}
            min={0}
            max={100}
            step={5}
            notchTicksVisible
            valueSuffix="%"
            onChange={(v) => patch({ volume_percent: v })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Normal unlock sound"
            rgOptions={soundOptions(settings.normal_sound)}
            selectedOption={settings.normal_sound}
            onChange={(o) => patch({ normal_sound: o.data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Rare unlock sound"
            rgOptions={soundOptions(settings.rare_sound)}
            selectedOption={settings.rare_sound}
            onChange={(o) => patch({ rare_sound: o.data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label="Add your own sounds">
            Drop .wav files into{" "}
            <code>~/homebrew/settings/AchievementNotifier/custom-sounds</code>{" "}
            then reopen this panel.
          </Field>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Colors">
        <ColorRow
          label="Normal - gradient start"
          value={settings.normal_gradient_start}
          onChange={(v) => patch({ normal_gradient_start: v })}
        />
        <ColorRow
          label="Normal - gradient end"
          value={settings.normal_gradient_end}
          onChange={(v) => patch({ normal_gradient_end: v })}
        />
        <ColorRow
          label="Normal - accent"
          value={settings.normal_accent_color}
          onChange={(v) => patch({ normal_accent_color: v })}
        />
        <ColorRow
          label="Rare - gradient start"
          value={settings.rare_gradient_start}
          onChange={(v) => patch({ rare_gradient_start: v })}
        />
        <ColorRow
          label="Rare - gradient end"
          value={settings.rare_gradient_end}
          onChange={(v) => patch({ rare_gradient_end: v })}
        />
        <ColorRow
          label="Rare - accent"
          value={settings.rare_accent_color}
          onChange={(v) => patch({ rare_accent_color: v })}
        />
      </PanelSection>

      <PanelSection title="Test">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => testNotification(false)}>
            Preview normal popup
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => testNotification(true)}>
            Preview rare popup
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Status">
        <PanelSectionRow>
          <Field label="Currently detected game">
            {status?.running_appid ? `App ${status.running_appid}` : "None"}
          </Field>
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label="API key configured">
            {status?.api_key_configured ? "Yes" : "No"}
          </Field>
        </PanelSectionRow>
        {status?.last_error ? (
          <PanelSectionRow>
            <Field label="Last error">{String(status.last_error)}</Field>
          </PanelSectionRow>
        ) : null}
      </PanelSection>
    </>
  );
};

const ColorRow: VFC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <PanelSectionRow>
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div
        style={{
          flex: "0 0 auto",
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.3)",
          background: value,
        }}
      />
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <TextField label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  </PanelSectionRow>
);
