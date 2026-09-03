import { VFC, useEffect, useRef, useState } from "react";
import { addEventListener, removeEventListener, callable } from "@decky/api";
import { AchievementNotifyPayload, Settings, FONT_STACKS } from "../types";
import { getPresetLayout } from "./presets";

const getSettings = callable<[], Settings>("get_settings");

interface QueueItem extends AchievementNotifyPayload {
  _key: number;
}

let keyCounter = 0;

const POSITION_STYLE: Record<string, React.CSSProperties> = {
  "top-left": { top: 24, left: 24, alignItems: "flex-start" },
  "top-right": { top: 24, right: 24, alignItems: "flex-end" },
  "top-center": { top: 24, left: "50%", transform: "translateX(-50%)", alignItems: "center" },
  "bottom-left": { bottom: 24, left: 24, alignItems: "flex-start" },
  "bottom-right": { bottom: 24, right: 24, alignItems: "flex-end" },
  "bottom-center": { bottom: 24, left: "50%", transform: "translateX(-50%)", alignItems: "center" },
};

export const NotificationManager: VFC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});

    const onNotify = (payload: AchievementNotifyPayload) => {
      setQueue((q) => [...q, { ...payload, _key: ++keyCounter }]);
    };
    const onSettingsUpdated = (s: Settings) => setSettings(s);

    addEventListener("achievement_notify", onNotify);
    addEventListener("achievement_notifier_settings_updated", onSettingsUpdated);
    return () => {
      removeEventListener("achievement_notify", onNotify);
      removeEventListener("achievement_notifier_settings_updated", onSettingsUpdated);
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // advance the queue
  useEffect(() => {
    if (current || queue.length === 0 || !settings) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);
    setPhase("in");

    const durationMs = Math.max(1000, settings.duration_seconds * 1000);
    const t1 = window.setTimeout(() => setPhase("hold"), 350);
    const t2 = window.setTimeout(() => setPhase("out"), durationMs - 350);
    const t3 = window.setTimeout(() => setCurrent(null), durationMs);
    timers.current.push(t1, t2, t3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, current, settings]);

  if (!settings || !current) return null;

  const layout = getPresetLayout(settings.preset);
  const isRare = current.is_rare;
  const gradStart = isRare ? settings.rare_gradient_start : settings.normal_gradient_start;
  const gradEnd = isRare ? settings.rare_gradient_end : settings.normal_gradient_end;
  const accent = isRare ? settings.rare_accent_color : settings.normal_accent_color;
  const scale = settings.scale_percent / 100;
  const posStyle = POSITION_STYLE[settings.position] || POSITION_STYLE["bottom-right"];

  const animClass =
    settings.animation === "fade"
      ? "an-anim-fade"
      : settings.animation === "pop"
      ? "an-anim-pop"
      : "an-anim-slide-" + (settings.position.includes("left") ? "left" : "right");

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "none",
        ...posStyle,
      }}
    >
      <style>{ANIMATION_CSS}</style>
      <div
        className={`an-card an-preset-${settings.preset} ${animClass} an-phase-${phase}`}
        style={
          {
            "--an-scale": scale,
            "--an-grad-start": gradStart,
            "--an-grad-end": gradEnd,
            "--an-accent": accent,
            "--an-font": FONT_STACKS[settings.font_family],
          } as React.CSSProperties
        }
      >
        {settings.show_icon && (
          <div className="an-icon-wrap">
            {current.icon_url ? (
              <img className="an-icon-img" src={current.icon_url} />
            ) : (
              <div className="an-icon-fallback">{layout.fallbackGlyph}</div>
            )}
          </div>
        )}
        <div className="an-text">
          <div className="an-title">{current.title}</div>
          <div className="an-desc">{current.description}</div>
          {current.sub_description ? (
            <div className="an-subdesc">{current.sub_description}</div>
          ) : null}
        </div>
        {isRare && <div className="an-rare-badge">RARE</div>}
      </div>
    </div>
  );
};

const ANIMATION_CSS = `
.an-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(12px * var(--an-scale, 1));
  min-width: calc(280px * var(--an-scale, 1));
  max-width: calc(420px * var(--an-scale, 1));
  padding: calc(14px * var(--an-scale, 1)) calc(18px * var(--an-scale, 1));
  border-radius: calc(10px * var(--an-scale, 1));
  background: linear-gradient(135deg, var(--an-grad-start), var(--an-grad-end));
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  font-family: var(--an-font);
  color: #fff;
  transition: transform 220ms ease, opacity 220ms ease;
  overflow: hidden;
}
.an-card::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: var(--an-accent);
}
.an-preset-minimal.an-card {
  padding: calc(10px * var(--an-scale,1)) calc(14px * var(--an-scale,1));
  border-radius: calc(6px * var(--an-scale,1));
  min-width: calc(220px * var(--an-scale,1));
}
.an-preset-banner.an-card {
  border-radius: 0;
  min-width: calc(380px * var(--an-scale,1));
  max-width: calc(560px * var(--an-scale,1));
}
.an-preset-playstation.an-card {
  border-radius: calc(4px * var(--an-scale,1));
  background: linear-gradient(180deg, rgba(20,20,24,0.96), rgba(8,8,10,0.96));
  border: 1px solid var(--an-accent);
}
.an-preset-playstation.an-card::before { display: none; }

.an-icon-wrap {
  flex: 0 0 auto;
  width: calc(44px * var(--an-scale,1));
  height: calc(44px * var(--an-scale,1));
  border-radius: calc(6px * var(--an-scale,1));
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.35);
  overflow: hidden;
}
.an-preset-playstation .an-icon-wrap {
  border-radius: 50%;
  border: 2px solid var(--an-accent);
}
.an-icon-img { width: 100%; height: 100%; object-fit: cover; }
.an-icon-fallback { font-size: calc(20px * var(--an-scale,1)); }

.an-text { display: flex; flex-direction: column; min-width: 0; }
.an-title {
  font-size: calc(11px * var(--an-scale,1));
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}
.an-desc {
  font-size: calc(15px * var(--an-scale,1));
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.an-subdesc {
  font-size: calc(11px * var(--an-scale,1));
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.an-rare-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: calc(9px * var(--an-scale,1));
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #1a1a1a;
  background: var(--an-accent);
  padding: 2px 6px;
  border-radius: 3px;
}

.an-anim-slide-right.an-phase-in { transform: translateX(30px); opacity: 0; }
.an-anim-slide-right.an-phase-hold { transform: translateX(0); opacity: 1; }
.an-anim-slide-right.an-phase-out { transform: translateX(30px); opacity: 0; }
.an-anim-slide-left.an-phase-in { transform: translateX(-30px); opacity: 0; }
.an-anim-slide-left.an-phase-hold { transform: translateX(0); opacity: 1; }
.an-anim-slide-left.an-phase-out { transform: translateX(-30px); opacity: 0; }
.an-anim-fade.an-phase-in { opacity: 0; }
.an-anim-fade.an-phase-hold { opacity: 1; }
.an-anim-fade.an-phase-out { opacity: 0; }
.an-anim-pop.an-phase-in { transform: scale(0.85); opacity: 0; }
.an-anim-pop.an-phase-hold { transform: scale(1); opacity: 1; }
.an-anim-pop.an-phase-out { transform: scale(0.9); opacity: 0; }
`;
