export type Preset = "xbox" | "playstation" | "minimal" | "banner";
export type Position =
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";
export type Animation = "slide" | "fade" | "pop";
export type FontFamily = "system" | "rounded" | "mono" | "condensed" | "serif";

export interface Settings {
  steam_api_key: string;
  steam_id64: string;
  enabled: boolean;

  preset: Preset;
  position: Position;
  animation: Animation;
  duration_seconds: number;
  scale_percent: number;
  font_family: FontFamily;
  show_icon: boolean;
  rarity_threshold_percent: number;

  volume_percent: number;
  normal_sound: string;
  rare_sound: string;

  normal_gradient_start: string;
  normal_gradient_end: string;
  normal_accent_color: string;
  rare_gradient_start: string;
  rare_gradient_end: string;
  rare_accent_color: string;

  poll_interval_seconds: number;
}

export interface AchievementNotifyPayload {
  title: string;
  description: string;
  sub_description?: string;
  icon_url: string | null;
  is_rare: boolean;
  unlock_time: number;
}

export interface Status {
  running_appid: number | null;
  api_key_configured: boolean;
  last_poll_epoch: number | null;
  last_error: string | null;
  last_unlock_title: string | null;
}

export const FONT_STACKS: Record<FontFamily, string> = {
  system:
    '"Motiva Sans", "Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif',
  rounded: '"Varela Round", "Segoe UI Rounded", "Segoe UI", sans-serif',
  mono: '"Consolas", "SF Mono", "Cascadia Code", monospace',
  condensed: '"Oswald", "Segoe UI Condensed", Arial Narrow, sans-serif',
  serif: '"Georgia", "Times New Roman", serif',
};
