# Signal — random 1-on-1 stranger chat

A text-based "talk to a random stranger" app: two visitors are paired up
automatically over WebSockets and can chat one-on-one, skip to a new stranger,
or report a conversation.

## Run it locally

```bash
npm install
npm start
```

Then open http://localhost:3000 in two different browser tabs (or on two
devices on the same network, using your machine's local IP) to test a match.

## How it works

- **server.js** — Express serves the static frontend; Socket.io handles
  matchmaking. Users who click "Start listening" are placed in a waiting
  queue and paired FIFO, with a light preference for shared interest tags.
  Messages, typing indicators, skip, and disconnects are relayed only
  between paired sockets.
- **public/** — the frontend (plain HTML/CSS/JS, no build step).
- Matchmaking state lives in memory, so this runs on a single server
  process. To scale across multiple instances, move `waitingQueue` and
  `pairs` into Redis (or similar) and use the Socket.io Redis adapter.

## Deploying it for real strangers to use

Pick any Node-friendly host — this needs a long-running process (not a
static host), since it holds live WebSocket connections:

- **Render / Railway / Fly.io** — connect the repo, they detect
  `npm start` automatically. Easiest options.
- **A VPS (DigitalOcean, Hetzner, etc.)** — `git clone`, `npm install`,
  run behind `pm2` or `systemd`, put nginx in front for TLS.

Set the `PORT` environment variable if your host requires a specific port
(most do this automatically).

## Before opening this to the public, please add

This starter has basic guardrails (report button, rate limiting, a max
message length) but is **not** a moderation system. Before real strangers
use it, seriously consider:

- **Age gating / ToS** — an age confirmation and clear terms of service.
  Anonymous chat with strangers carries real risk for minors — this is the
  single most important addition if the app will be public.
- **Persisting reports** — right now `report` events just log to the
  server console. Wire them into a database and a moderation workflow.
- **Text moderation** — a profanity/abuse filter or a moderation API to
  flag or block harmful messages before they're relayed.
- **Abuse prevention** — IP-based rate limiting on matchmaking itself
  (not just messages) to slow down bot/spam accounts, and a way to ban
  repeat offenders.
- **Legal review** — anonymous stranger-chat platforms carry real legal
  and safety obligations (e.g. CSAM reporting duties) depending on your
  jurisdiction; talk to a lawyer before launching publicly.

## Customizing

- Colors, type, and the "tuning into a signal" visual theme all live in
  `public/style.css` (see the `:root` variables at the top).
- Matchmaking rules (interest weighting, queue order) live in
  `findMatchFor()` in `server.js`.
