"""
Achievement Notifier - Decky Loader plugin backend.

Detection strategy (chosen to be robust rather than clever):
  1. Fast trigger: tail Steam's stats_log.txt. Steam writes a line to this file
     the moment any achievement is unlocked, in-session. We don't try to parse
     the exact wording (Valve does not document/guarantee the format) - we only
     use it as a "something happened, go check now" signal. This gives near
     instant reaction time.
  2. Source of truth: the Steam Web API.
        - GetPlayerAchievements   -> which achievements are unlocked right now
        - GetSchemaForGame        -> display name / description / icon per achievement
        - GetGlobalAchievementPercentagesForApp (no key needed) -> rarity %
     We poll this on a slow timer (settings.poll_interval_seconds) AND
     immediately whenever the fast trigger above fires, so most unlocks are
     reported within a second or two, and we always fall back gracefully to
     the slow poll if the log line format ever changes or is missed.

  If no Steam Web API key is configured, we still fire a generic "Achievement
  Unlocked" popup off the fast trigger alone (no name/icon/rarity), so the
  plugin is still useful out of the box - full detail just requires a (free)
  API key from https://steamcommunity.com/dev/apikey pasted into settings.

All of this only runs while a game is actually detected as running (via
/proc/*/environ SteamAppId, same technique used by other Decky achievement
plugins), so the plugin is idle otherwise.
"""

import asyncio
import glob
import json
import os
import time
import urllib.parse
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional, Set, Tuple

import decky

# ---------------------------------------------------------------------------
# Constants / paths
# ---------------------------------------------------------------------------

HOME_DIR = os.path.expanduser("~")
STEAM_ROOT = os.path.join(HOME_DIR, ".local", "share", "Steam")
STEAM_LOG_PATH = os.path.join(STEAM_ROOT, "logs", "stats_log.txt")
STEAM_USERDATA_GLOB = os.path.join(STEAM_ROOT, "userdata", "*")

STEAM_ID64_BASE = 76561197960265728
STEAM_API_BASE_URL = "https://api.steampowered.com"
STEAM_API_TIMEOUT_SECONDS = 4.0

IGNORED_APPIDS = {0, 7, 769, 1675200}  # 0=none, common Steam-internal ids

DEFAULT_SETTINGS: Dict[str, Any] = {
    "steam_api_key": "",
    "steam_id64": "",  # auto-detected if left blank
    "enabled": True,

    "preset": "xbox",              # xbox | playstation | minimal | banner
    "position": "bottom-right",    # top-left | top-right | top-center |
                                    # bottom-left | bottom-right | bottom-center
    "animation": "slide",          # slide | fade | pop
    "duration_seconds": 6,
    "scale_percent": 100,
    "font_family": "system",       # system | rounded | mono | condensed | serif
    "show_icon": True,
    "rarity_threshold_percent": 10,

    "volume_percent": 70,
    "normal_sound": "normal_default.wav",
    "rare_sound": "rare_default.wav",

    "normal_gradient_start": "hsla(210, 90%, 40%, 0.95)",
    "normal_gradient_end": "hsla(210, 90%, 18%, 0.95)",
    "normal_accent_color": "hsla(200, 100%, 60%, 1)",
    "rare_gradient_start": "hsla(43, 93%, 52%, 0.95)",
    "rare_gradient_end": "hsla(30, 90%, 22%, 0.95)",
    "rare_accent_color": "hsla(45, 100%, 65%, 1)",

    "poll_interval_seconds": 8,
}

SOUNDS_DIR_NAME = "sounds"


class Plugin:
    def __init__(self) -> None:
        self._stop_event = asyncio.Event()
        self._wake_event = asyncio.Event()

        self._log_watch_task: Optional[asyncio.Task] = None
        self._poll_task: Optional[asyncio.Task] = None

        self._log_inode: Optional[int] = None
        self._log_position: int = 0

        self._current_appid: Optional[int] = None
        self._known_unlocked: Dict[int, Set[str]] = {}
        self._schema_cache: Dict[int, Dict[str, Dict[str, Any]]] = {}
        self._percent_cache: Dict[int, Dict[str, float]] = {}
        self._baseline_done: Set[int] = set()

        self._status: Dict[str, Any] = {
            "running_appid": None,
            "api_key_configured": False,
            "last_poll_epoch": None,
            "last_error": None,
            "last_unlock_title": None,
        }

    # -- lifecycle ----------------------------------------------------------

    async def _main(self) -> None:
        self._stop_event.clear()
        settings = self._load_settings()
        self._save_settings(settings)
        self._log_watch_task = asyncio.create_task(
            self._watch_log_trigger(), name="an-log-watch"
        )
        self._poll_task = asyncio.create_task(
            self._poll_loop(), name="an-poll-loop"
        )
        decky.logger.info("Achievement Notifier backend started")

    async def _unload(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        for task in (self._log_watch_task, self._poll_task):
            if task is not None and not task.done():
                task.cancel()
        decky.logger.info("Achievement Notifier backend stopped")

    # -- settings -------------------------------------------------------

    def _settings_dir(self) -> str:
        return decky.DECKY_PLUGIN_SETTINGS_DIR

    def _settings_path(self) -> str:
        return os.path.join(self._settings_dir(), "settings.json")

    def _sound_dir(self) -> str:
        return os.path.join(decky.DECKY_PLUGIN_DIR, "assets", SOUNDS_DIR_NAME)

    def _custom_sound_dir(self) -> str:
        path = os.path.join(self._settings_dir(), "custom-sounds")
        os.makedirs(path, exist_ok=True)
        return path

    def _list_sound_files(self) -> List[str]:
        sounds: Set[str] = set()
        for d in (self._sound_dir(), self._custom_sound_dir()):
            try:
                for entry in os.listdir(d):
                    if entry.lower().endswith(".wav"):
                        sounds.add(entry)
            except OSError:
                continue
        return sorted(sounds, key=str.lower)

    def _sanitize_settings(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        s = dict(DEFAULT_SETTINGS)
        for key in (
            "steam_api_key", "steam_id64", "preset", "position", "animation",
            "font_family", "normal_sound", "rare_sound",
            "normal_gradient_start", "normal_gradient_end", "normal_accent_color",
            "rare_gradient_start", "rare_gradient_end", "rare_accent_color",
        ):
            value = raw.get(key)
            if isinstance(value, str):
                s[key] = value
        for key in ("enabled", "show_icon"):
            value = raw.get(key)
            if isinstance(value, bool):
                s[key] = value
        for key, lo, hi in (
            ("duration_seconds", 2, 15),
            ("scale_percent", 50, 150),
            ("rarity_threshold_percent", 0, 100),
            ("volume_percent", 0, 100),
            ("poll_interval_seconds", 3, 30),
        ):
            try:
                v = float(raw.get(key, s[key]))
            except (TypeError, ValueError):
                v = s[key]
            s[key] = max(lo, min(hi, v))
        if s["preset"] not in ("xbox", "playstation", "minimal", "banner"):
            s["preset"] = "xbox"
        if s["position"] not in (
            "top-left", "top-right", "top-center",
            "bottom-left", "bottom-right", "bottom-center",
        ):
            s["position"] = "bottom-right"
        if s["animation"] not in ("slide", "fade", "pop"):
            s["animation"] = "slide"
        if s["font_family"] not in ("system", "rounded", "mono", "condensed", "serif"):
            s["font_family"] = "system"
        return s

    def _load_settings(self) -> Dict[str, Any]:
        try:
            with open(self._settings_path(), "r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:
            return dict(DEFAULT_SETTINGS)
        if not isinstance(raw, dict):
            return dict(DEFAULT_SETTINGS)
        return self._sanitize_settings(raw)

    def _save_settings(self, settings: Dict[str, Any]) -> None:
        try:
            os.makedirs(self._settings_dir(), exist_ok=True)
            with open(self._settings_path(), "w", encoding="utf-8") as f:
                json.dump(settings, f, indent=2, sort_keys=True)
        except OSError as err:
            decky.logger.warning("Unable to save settings: %s", err)

    # -- public API called from the frontend --------------------------------

    async def get_settings(self) -> dict:
        return self._load_settings()

    async def set_settings(self, settings: dict) -> dict:
        merged = self._sanitize_settings({**self._load_settings(), **settings})
        self._save_settings(merged)
        self._wake_event.set()  # re-evaluate immediately (e.g. key just added)
        await decky.emit("achievement_notifier_settings_updated", merged)
        return merged

    async def list_sounds(self) -> List[str]:
        return self._list_sound_files()

    async def get_status(self) -> dict:
        settings = self._load_settings()
        self._status["api_key_configured"] = bool(settings.get("steam_api_key"))
        self._status["running_appid"] = self._current_appid
        return dict(self._status)

    async def test_notification(self, rare: bool) -> None:
        payload = {
            "title": "Rare Achievement Unlocked" if rare else "Achievement Unlocked",
            "description": "This is a preview of your notification style.",
            "icon_url": None,
            "is_rare": bool(rare),
            "unlock_time": time.time(),
        }
        await self._play_sound(bool(rare))
        await decky.emit("achievement_notify", payload)

    # -- appid detection ------------------------------------------------

    def _detect_running_appid(self) -> Optional[int]:
        for pid_text in os.listdir("/proc"):
            if not pid_text.isdigit():
                continue
            environ_path = os.path.join("/proc", pid_text, "environ")
            try:
                with open(environ_path, "rb") as f:
                    environ = f.read()
            except OSError:
                continue
            for raw_item in environ.split(b"\0"):
                if not raw_item.startswith((b"SteamAppId=", b"SteamGameId=")):
                    continue
                try:
                    value = raw_item.split(b"=", 1)[1].decode("ascii", "ignore")
                    appid = int(value)
                except (IndexError, ValueError):
                    continue
                if appid not in IGNORED_APPIDS:
                    return appid
        return None

    def _detect_steam_id64(self, settings: Dict[str, Any]) -> Optional[int]:
        manual = str(settings.get("steam_id64") or "").strip()
        if manual.isdigit():
            return int(manual)
        best_path, best_mtime = None, -1.0
        for path in glob.glob(STEAM_USERDATA_GLOB):
            base = os.path.basename(path)
            if not base.isdigit() or base == "0":
                continue
            try:
                mtime = os.path.getmtime(path)
            except OSError:
                continue
            if mtime > best_mtime:
                best_mtime, best_path = mtime, path
        if best_path is None:
            return None
        accountid = int(os.path.basename(best_path))
        return STEAM_ID64_BASE + accountid

    # -- Steam Web API helpers -----------------------------------------

    def _api_get(self, path: str, params: Dict[str, Any]) -> Optional[dict]:
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
        url = f"{STEAM_API_BASE_URL}{path}?{query}"
        try:
            with urllib.request.urlopen(url, timeout=STEAM_API_TIMEOUT_SECONDS) as resp:
                return json.loads(resp.read().decode("utf-8", "ignore"))
        except urllib.error.HTTPError as err:
            self._status["last_error"] = f"HTTP {err.code} on {path}"
            return None
        except Exception as err:
            self._status["last_error"] = f"{path}: {err}"
            return None

    async def _fetch_schema(self, appid: int, api_key: str) -> Dict[str, Dict[str, Any]]:
        if appid in self._schema_cache:
            return self._schema_cache[appid]
        data = await asyncio.to_thread(
            self._api_get,
            "/ISteamUserStats/GetSchemaForGame/v2/",
            {"key": api_key, "appid": appid, "l": "english"},
        )
        result: Dict[str, Dict[str, Any]] = {}
        try:
            achievements = data["game"]["availableGameStats"]["achievements"]
            for a in achievements:
                result[a["name"]] = {
                    "display_name": a.get("displayName") or a["name"],
                    "description": a.get("description") or "",
                    "icon": a.get("icon"),
                    "icon_gray": a.get("icongray"),
                    "hidden": bool(a.get("hidden")),
                }
        except (KeyError, TypeError):
            pass
        self._schema_cache[appid] = result
        return result

    async def _fetch_global_percentages(self, appid: int) -> Dict[str, float]:
        if appid in self._percent_cache:
            return self._percent_cache[appid]
        data = await asyncio.to_thread(
            self._api_get,
            "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
            {"gameid": appid},
        )
        result: Dict[str, float] = {}
        try:
            for a in data["achievementpercentages"]["achievements"]:
                result[a["name"]] = float(a["percent"])
        except (KeyError, TypeError, ValueError):
            pass
        self._percent_cache[appid] = result
        return result

    async def _fetch_unlocked_set(
        self, appid: int, steam_id64: int, api_key: str
    ) -> Optional[Tuple[Set[str], Dict[str, float]]]:
        data = await asyncio.to_thread(
            self._api_get,
            "/ISteamUserStats/GetPlayerAchievements/v0001/",
            {"key": api_key, "steamid": steam_id64, "appid": appid, "l": "english"},
        )
        if not data or "playerstats" not in data or not data["playerstats"].get("success"):
            return None
        unlocked: Set[str] = set()
        unlock_times: Dict[str, float] = {}
        for a in data["playerstats"].get("achievements", []):
            if a.get("achieved"):
                name = a["apiname"]
                unlocked.add(name)
                unlock_times[name] = float(a.get("unlocktime") or 0)
        return unlocked, unlock_times

    # -- notification emission ------------------------------------------

    async def _play_sound(self, is_rare: bool) -> None:
        settings = self._load_settings()
        volume = int(settings.get("volume_percent", 70))
        if volume <= 0:
            return
        filename = settings["rare_sound"] if is_rare else settings["normal_sound"]
        candidates = [
            os.path.join(self._custom_sound_dir(), filename),
            os.path.join(self._sound_dir(), filename),
        ]
        sound_path = next((p for p in candidates if os.path.exists(p)), None)
        if sound_path is None:
            return
        env = os.environ.copy()
        runtime_dir = env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
        env["XDG_RUNTIME_DIR"] = runtime_dir
        pulse_volume = max(0, min(131072, int(round((volume / 100.0) * 65536))))
        try:
            proc = await asyncio.create_subprocess_exec(
                "paplay",
                "--stream-name", "AchievementNotifier",
                "--property=media.role=event",
                f"--volume={pulse_volume}",
                sound_path,
                env=env,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            asyncio.create_task(proc.wait())
        except Exception as err:
            decky.logger.warning("Audio playback failed: %s", err)

    async def _emit_unlock(
        self,
        display_name: str,
        description: str,
        icon_url: Optional[str],
        is_rare: bool,
        unlock_time: float,
    ) -> None:
        await self._play_sound(is_rare)
        payload = {
            "title": "Rare Achievement Unlocked" if is_rare else "Achievement Unlocked",
            "description": display_name if not description else f"{display_name}",
            "sub_description": description,
            "icon_url": icon_url,
            "is_rare": is_rare,
            "unlock_time": unlock_time,
        }
        self._status["last_unlock_title"] = display_name
        await decky.emit("achievement_notify", payload)
        decky.logger.info("Achievement unlock emitted: %s (rare=%s)", display_name, is_rare)

    async def _emit_generic_fallback(self) -> None:
        await self._play_sound(False)
        payload = {
            "title": "Achievement Unlocked",
            "description": "Add a free Steam Web API key in settings for names, icons and rarity.",
            "sub_description": "",
            "icon_url": None,
            "is_rare": False,
            "unlock_time": time.time(),
        }
        await decky.emit("achievement_notify", payload)

    # -- fast trigger: stats_log.txt tail --------------------------------

    async def _watch_log_trigger(self) -> None:
        while not self._stop_event.is_set():
            try:
                if not os.path.exists(STEAM_LOG_PATH):
                    await asyncio.sleep(3.0)
                    continue
                stat = os.stat(STEAM_LOG_PATH)
                if self._log_inode is None:
                    self._log_inode = stat.st_ino
                    self._log_position = stat.st_size  # don't replay old history
                elif stat.st_ino != self._log_inode or stat.st_size < self._log_position:
                    self._log_inode = stat.st_ino
                    self._log_position = 0

                with open(STEAM_LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
                    f.seek(self._log_position)
                    triggered = False
                    while True:
                        line = f.readline()
                        if not line:
                            self._log_position = f.tell()
                            break
                        if "achiev" in line.lower():
                            triggered = True
                    if triggered:
                        self._wake_event.set()
            except asyncio.CancelledError:
                raise
            except Exception as err:
                decky.logger.warning("Log trigger watcher error: %s", err)
            await asyncio.sleep(0.5)

    # -- slow poll / reconcile loop ---------------------------------------

    async def _poll_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                settings = self._load_settings()
                if not settings.get("enabled", True):
                    await self._sleep_or_wake(settings)
                    continue

                appid = self._detect_running_appid()
                if appid != self._current_appid:
                    decky.logger.info("Detected app change: %s -> %s", self._current_appid, appid)
                    self._current_appid = appid
                    if appid is not None:
                        self._baseline_done.discard(appid)

                if appid is None:
                    await self._sleep_or_wake(settings)
                    continue

                api_key = str(settings.get("steam_api_key") or "").strip()
                if not api_key:
                    # No key: we can still react to the fast trigger with a
                    # generic popup, but there's nothing to poll.
                    if self._wake_event.is_set():
                        self._wake_event.clear()
                        await self._emit_generic_fallback()
                    await self._sleep_or_wake(settings)
                    continue

                steam_id64 = self._detect_steam_id64(settings)
                if steam_id64 is None:
                    self._status["last_error"] = "Could not determine SteamID64"
                    await self._sleep_or_wake(settings)
                    continue

                result = await self._fetch_unlocked_set(appid, steam_id64, api_key)
                self._status["last_poll_epoch"] = time.time()
                if result is None:
                    await self._sleep_or_wake(settings)
                    continue
                unlocked, unlock_times = result

                previous = self._known_unlocked.get(appid)
                if previous is None or appid not in self._baseline_done:
                    # First time seeing this app this session: this is our
                    # baseline, don't fire notifications retroactively for
                    # achievements the player already had.
                    self._known_unlocked[appid] = unlocked
                    self._baseline_done.add(appid)
                    self._wake_event.clear()
                    await self._sleep_or_wake(settings)
                    continue

                new_ids = unlocked - previous
                self._known_unlocked[appid] = unlocked
                self._wake_event.clear()

                if new_ids:
                    schema = await self._fetch_schema(appid, api_key)
                    percentages = await self._fetch_global_percentages(appid)
                    threshold = float(settings.get("rarity_threshold_percent", 10))
                    # emit oldest-unlocked-first for a sane order
                    ordered = sorted(new_ids, key=lambda n: unlock_times.get(n, 0))
                    for name in ordered:
                        info = schema.get(name, {})
                        display_name = info.get("display_name", name)
                        description = info.get("description", "")
                        icon_url = info.get("icon") if settings.get("show_icon", True) else None
                        percent = percentages.get(name)
                        is_rare = percent is not None and percent <= threshold
                        await self._emit_unlock(
                            display_name, description, icon_url, is_rare,
                            unlock_times.get(name, time.time()),
                        )
                        await asyncio.sleep(0.6)  # stagger multi-unlocks slightly

                await self._sleep_or_wake(settings)
            except asyncio.CancelledError:
                raise
            except Exception as err:
                self._status["last_error"] = str(err)
                decky.logger.error("Poll loop error: %s", err)
                await asyncio.sleep(3.0)

    async def _sleep_or_wake(self, settings: Dict[str, Any]) -> None:
        interval = float(settings.get("poll_interval_seconds", 8))
        try:
            await asyncio.wait_for(self._wake_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
