# Claude Raffle

Live giveaway drawing app for the Claude Code meetup (Clawd hat prize). Zero-dependency Node server + two vanilla HTML pages. Built as a quick Claude Code showcase. Public repo; user-facing docs live in README.md, this file is the agent-facing map.

## Run it (day-of checklist)

```bash
npm start          # starts cloudflared tunnel + server on :4747
```

Then open **http://localhost:4747/screen** on the laptop and put it on the projector. The QR code on screen points at the tunnel URL; attendees scan it and enter their name.

- No cloudflared / tunnel fails → falls back to LAN IP URL (only works if venue wifi allows device-to-device traffic). Install: `brew install cloudflared`.
- Tunnel runs `--protocol http2`: the default QUIC dropped with ~9s idle-timeout outages during testing (all phone controls die at once while the screen keeps running; phones show "reconnecting to the big screen…" until it recovers). If a lapse happens anyway, it self-heals — don't restart anything.
- `node server.js` runs it without the tunnel (local testing).

## Controls (screen page)

- `space` — draw a winner (slot-machine shuffle → lands → confetti)
- `r` — draw again (winner left / re-roll)
- `esc` — close winner overlay, back to the entrant wall
- `c` twice within 1.5s — reset all entries (do this right before doors open)

## Architecture

- `server.js` — http server: static files, `POST /api/enter`, `POST /api/move` (phone d-pad → SSE relay), `POST /api/look` (token-authed custom look `{c, e}` stored on the entry and rebroadcast; SSE payloads carry `{name, look}` and never tokens), SSE at `/api/events`, `POST /api/draw` + `/api/reset` (localhost-only, so phones can't trigger them), `GET /api/config` (public URL for QR).
- Phones can restyle their critter: tapping your Clawd above the d-pad opens a shuffled 3×3 look picker; picking one POSTs `/api/look` and the big screen (tank + draw overlay) redraws that critter instantly. Look = color/eye indexes; size stays name-hashed.
- `start.sh` — spawns cloudflared, greps the trycloudflare URL, passes it as `PUBLIC_URL` to the server.
- `entries.json` — persisted `{name, token}` entries; survives a server restart. Tokens are per-entry secrets minted at entry time — they authorize `/api/move` and never go out over SSE.
- `public/index.html` — phone entry page. `public/screen.html` — big-screen page (QR, live critter tank, draw animation). The tank is a rough pixel-art map of Boulder (north up, west left) under the critters — forested foothills along the west edge, Flatirons SW with the Chautauqua meadow at their base, CU north of them, Boulder Creek east-west through the middle, Pearl Street just north of the creek, Natural Grocers east, and the coral-marked "claude code meetup" venue in east Boulder. See `buildLandmarks()` in screen.html.
- `public/clawd.js` — pixel-art Clawd renderer shared by both pages. 72 variants (6 body shades × 12 eye styles, plus ±15% size) hashed deterministically from the entrant's name, so the same person gets the same critter everywhere. Eyes-only faces, no accessories (official Clawd style). Review them all at `/gallery.html`. Critters wander the tank with a waypoint random-walk (occasional fast scuttle); reduced-motion gets a static grid.

## Gotchas

- The draw animation runs client-side on the screen page from the SSE `draw` event; the winner is picked server-side with `crypto.randomInt`.
- qrcodejs comes from cdnjs with an SRI hash — the screen page needs internet on the laptop.
- Entries cap at 24 chars, whitespace-collapsed. Duplicate names are rejected with 409 ("add a last initial?") — display names stay unique so the winner callout is unambiguous, and nobody can claim someone else's critter by typing their name.
- After entering, the phone becomes a d-pad controller (tap = one step, hold = repeat every 160ms). Moves require the entry's token; wrong/missing token → 403. A driven critter stops wandering for 8s after the last command.
- If entries are reset while a phone still holds a stale "you're in" state, its next move gets a 404/403 and the phone drops back to the entry form automatically. Old string-format `entries.json` / localStorage from before tokens are migrated/cleared on load.
- **Scale (tested reasoning, ~100 attendees):** phones hold NO persistent connections through the tunnel — the entry-page count polls `/api/config` every 8s (staggered). Only the screen uses SSE, and it's on localhost. This keeps the free quick-tunnel's ~200 in-flight request cap irrelevant. Don't reintroduce phone-side SSE/EventSource.
- **Recording demos:** a look can carry `s` (size index 0–4) so a renamed entry keeps its exact critter; phones never set it. Record with a headless Playwright `recordVideo` session (terminal `screencapture` lacks Screen Recording permission). `docs/demo.gif` uses fictional names; never commit real attendee entries.
- Names get a light hate-speech filter (`isHateful` in server.js): slurs/hate terms blocked with leet + spacing normalization; crude-but-funny names allowed BY DESIGN — don't expand it into a profanity filter. Substring vs whole-word lists exist to dodge Scunthorpe false positives (spice, raccoon, therapist, Van Dyke). Still reset (`c c`) before doors; `r` re-draws if needed.
