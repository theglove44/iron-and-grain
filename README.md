# Iron & Grain

An offline, turn-based strategy game for iPhone (and any browser). Build a city,
run its economy, research technology, raise an army and conquer rival realms.
Every map is randomly generated, and your ruler levels up across games.

## Install on iPhone

1. Open the hosted URL in **Safari** while online.
2. Tap **Share → Add to Home Screen**.
3. Open it from the home screen once. The title screen should say
   **"✓ Ready to play offline"**. After that it works in flight mode.

Progress saves automatically every turn and whenever you leave the app.

## How it works

It's a plain web page with no build step and no dependencies.

| File | What it holds |
|---|---|
| `index.html` | Page layout and all styling |
| `js/data.js` | Game content: buildings, units, technologies, events, achievements, help text |
| `js/core.js` | Rules: map generation, borders, vision, economy, building, saving |
| `js/ai.js` | Units, combat, rival and barbarian AI, end-of-turn processing |
| `js/render.js` | Drawing the map, camera, touch controls |
| `js/ui.js` | Top bar, bottom panel, tap handling, map actions |
| `js/screens.js` | Title, new game, research, realm, events, game over; startup |
| `sw.js` | Offline support: caches every file on first visit |
| `tools/make-icons.swift` | Regenerates the app icons (`swift tools/make-icons.swift`) |

## Updating the game

After changing any file, bump `VERSION` in `sw.js` (e.g. `ironGrain-v5`) and push.
Phones check for updates every time the app opens. A new version downloads in
the background and applies automatically: straight away on the title screen,
otherwise the next time you return to it. The title screen shows the installed
version. Add any new file to the `FILES` list in `sw.js`.

Re-adding the app to the home screen gives it fresh storage, so saves and
Ruler XP from the old icon are lost. Avoid that once a real game is under way.

## Checking it works

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765 in Chrome. Offline mode needs `localhost` or
HTTPS. It will not work from a plain `http://` LAN address or the Claude
desktop browser pane.
