# Achievement Notifier

A [Decky Loader](https://decky.xyz) plugin for Steam Deck that shows a
customizable achievement popup in Game Mode — over your game, not just in the
Quick Access Menu — with four style presets, configurable position,
animation, colors, font, size, icon, sounds, and a rarity threshold for a
distinct "rare achievement" style.

Inspired by [SteamAchievementNotifier](https://github.com/steamachievementnotifier/steamachievementnotifier)
and built on the same general idea as
[decky-xboxachievements/SANSO](https://github.com/joeblack2k/decky-xboxachievements),
but detection here is done purely through the Steam Web API (see below)
rather than a separate gamescope overlay helper process, which keeps the
plugin simpler and easier to theme.

## How detection works

1. **Fast trigger**: the backend tails Steam's `stats_log.txt`. Steam writes
   a line here the instant any achievement unlocks. We don't parse the exact
   text (Valve doesn't document/guarantee its format) — it's only used as an
   "check now" signal, so it survives Steam updates changing the wording.
2. **Source of truth**: the [Steam Web API](https://steamcommunity.com/dev/apikey)
   (`GetPlayerAchievements`, `GetSchemaForGame`, `GetGlobalAchievementPercentagesForApp`)
   is polled (every few seconds while a game is running, and immediately when
   the fast trigger fires) to get the exact achievement name, description,
   icon, and global rarity %.

**You need a free Steam Web API key** for full popups (name/icon/rarity).
Get one instantly at <https://steamcommunity.com/dev/apikey> (any domain
name works, e.g. `localhost`), then paste it into the plugin's settings.
Your Steam **achievement stats must not be set to private** (this is the
default; check `steamcommunity.com/my/edit/settings` if unsure).

Without a key, you still get a generic "Achievement Unlocked" popup with no
name/icon — the fast trigger still works, there's just nothing to look up
the details with.

## Features

- 4 layout presets: **Xbox-style**, **PlayStation trophy**, **Minimal toast**, **Banner**
- Position: any of 6 screen corners/edges
- Animation: slide / fade / pop
- Adjustable size, duration, and font
- Separate colors (gradient + accent) for normal vs. rare unlocks
- Adjustable rarity threshold (% of players who have the achievement)
- Separate sounds + volume for normal vs. rare unlocks, with support for
  dropping in your own `.wav` files
- Live preview buttons in the settings panel

## Building

Requires Node.js v16.14+ and `pnpm` v9.

```bash
sudo npm i -g pnpm@9
pnpm i
pnpm run build
```

This produces `dist/index.js`.

## Installing on your Deck

1. Switch to Desktop Mode.
2. Copy this whole folder (after building it — it needs `dist/index.js`,
   `main.py`, `plugin.json`, `package.json`, and `assets/`) to:

   ```
   ~/homebrew/plugins/AchievementNotifier
   ```

3. Restart Decky Loader:

   ```bash
   sudo systemctl restart plugin_loader
   ```

4. Go back to Game Mode, open the Decky menu, find **Achievement Notifier**,
   paste in your Steam Web API key, and hit one of the "Preview" buttons to
   confirm it renders the way you like.

## Notes / limitations

- Detection needs an internet connection (the Web API calls require it).
  With no internet and no key, only the generic fallback popup will fire.
- Achievement unlock time comes from Steam's own record, so there can be a
  few seconds of latency between the in-game unlock and the popup (poll
  interval is adjustable, default 8s, but the log-file trigger usually wakes
  it up within a second or two of the real unlock).
- Custom sounds go in `~/homebrew/settings/AchievementNotifier/custom-sounds/`
  as `.wav` files; they'll show up in the sound dropdowns after reopening the
  settings panel.
- If achievements aren't showing at all, check the **Status** section at the
  bottom of the settings panel — it shows the currently detected game and
  whether the API key registered correctly.

## AI disclosure

This plugin was built with AI assistance (Claude). It has not been tested on
real Steam Deck hardware — please open an issue (or just fix it) if
something in the build or runtime behavior needs adjusting for your setup.
