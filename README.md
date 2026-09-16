# StudyHub Workspace

A dark-themed co-working dashboard: tasks, notes, alarms, a Pomodoro timer,
and live study rooms with camera/mic calling and chat.

## What's new in this version

The previous version simulated "real time" rooms purely with
`localStorage` and the browser's `storage` event, which only ever worked
between tabs on the *same browser*. That's gone. Rooms, presence, chat,
and the focus timer are now backed by a real Node server
(`server.js`) over Socket.IO — which is also what makes the new camera/mic
calling possible at all, since two different devices can only set up a
WebRTC call if there's a real channel between them to exchange connection
info over first.

- **Camera & mic calling** (`public/js/webrtc.js`) — join a room and you
  automatically connect to everyone already there over WebRTC (mesh
  topology), with mute/camera-off toggles. Signaling (offer/answer/ICE
  candidates) rides over the same Socket.IO connection as everything
  else; the actual audio/video never passes through the server.
- **Dashboard** now shows your open tasks and upcoming alarms at a
  glance, instead of a room grid.
- **Stream** is now the single home for rooms: browsing, search, join by
  code, and Favourites (previously its own sidebar entry) are all tabs
  inside it. Joining a room takes you to a room screen — video grid, chat,
  participants, focus timer — that's reached only from, and returns only
  to, Stream.
- **Room passwords are now actually hashed server-side** (Node's
  `crypto.scryptSync`, per-room salt, `timingSafeEqual` comparison) and
  never sent to the client. The previous version computed a
  non-cryptographic hash *client-side*, which was openly documented as a
  mild deterrent rather than real protection — this is a genuine step up,
  though there's still no real user authentication (see Limitations).

Everything else — tasks, notes, alarms, Pomodoro, your profile, your
background image, your favourite rooms — is still just `localStorage` and
needs no server. Those work identically whether or not `server.js` is
running.

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:3000**. That's it — `server.js` serves the
whole frontend out of `public/`, so there's nothing else to configure for
local use.

If you only care about tasks/notes/alarms/Pomodoro, you technically don't
need the server at all — `public/index.html` still works opened directly.
Stream (rooms, chat, camera) specifically needs the server, since that's
what makes cross-device sync and WebRTC signaling possible; opened without
it, the app shows a toast explaining that instead of silently failing.

### Environment

- `PORT` — defaults to `3000`.
- Requires Node 18+.

## Deploying it

This is a single Node process with no database — deploy it anywhere that
runs a persistent Node process (Render, Railway, Fly.io, a plain VPS,
etc.). Static hosts (Netlify/Vercel's static tier, GitHub Pages) won't
work for Stream, since there's no server to connect to — the rest of the
app (tasks/notes/alarms/Pomodoro) would still work if you deployed only
`public/` somewhere static, but you'd lose rooms entirely.

Typical steps on a platform like Render/Railway:
1. Point it at this repo, build command `npm install`, start command
   `npm start`.
2. Set `PORT` if the platform requires a specific one (most inject it
   automatically, which `server.js` already reads from `process.env.PORT`).
3. Done — no database, no extra services required for a single instance.

## Tests

Two test suites, both drive the *real* code (not mocks of it):

```bash
node test/integration.js   # starts the real server, drives it with two
                            # real socket.io-client connections through
                            # room create/join/password/capacity/chat/
                            # WebRTC-signal-relay/focus-timer/host-
                            # reassignment/disconnect-cleanup
node test/client.js        # loads the real index.html + all real
                            # frontend JS into a simulated browser (jsdom)
                            # with mocked getUserMedia/RTCPeerConnection/
                            # Socket.IO, and exercises dashboard sync,
                            # room browsing, favourites, joining, camera
                            # call setup, chat, and mic/cam toggles
```

Both currently pass in full (28/28 and 33/33 checks). Neither test
requires network access or a real camera/microphone.

## Known limitations (being upfront about these)

- **No real user accounts.** A "user" is an id the browser generates for
  itself on first visit and remembers in `localStorage`. There's nothing
  stopping someone from clearing storage and getting a new identity, or
  (with some effort) impersonating an id they've seen. Room passwords are
  now properly hashed server-side, but that's access control for a room,
  not authentication of a person.
- **State lives in memory, in one process.** Perfectly fine for a single
  deployed instance — simple, no database needed. Running more than one
  instance behind a load balancer would need shared state (e.g. the
  Socket.IO Redis adapter), since two instances otherwise can't see each
  other's rooms. Restarting the server clears all rooms (the 5 default
  ones reseed automatically); it does *not* touch anyone's localStorage
  data (tasks, notes, etc.).
- **Video calling is full mesh, capped at 8 connections per person.**
  Every participant connects directly to every other one, which is simple
  and works well for small groups but costs each device more bandwidth
  and CPU as the room grows. Beyond 8 simultaneous connections, additional
  participants are still fully in the room (chat, presence, focus timer)
  just without an automatic video connection. Real scale (dozens of
  people) needs an SFU (LiveKit, mediasoup, Janus, etc.) instead of mesh
  — a bigger undertaking, out of scope here.
- **STUN only, no TURN server.** Most networks (home wifi, most offices,
  mobile data) connect fine with just the public STUN server configured
  in `webrtc.js`. Strict corporate firewalls or some mobile carrier NATs
  sometimes need a TURN relay to connect at all — if calls fail to
  connect specifically on such a network, that's almost always why. Adding
  one (e.g. via a provider like Twilio, or self-hosted coturn) is a
  config change in `webrtc.js`'s `ICE_SERVERS`, not a redesign.
- **Disconnect grace period is 10 seconds.** A refresh or brief network
  blip while in a room won't remove you; going away for longer will.

## Project layout

```
server.js              Express + Socket.IO backend (rooms, chat, WebRTC signaling relay)
package.json
public/
  index.html
  styles.css
  js/
    utils.js            shared helpers (escaping, ids, toasts)
    storage.js           localStorage wrapper + key registry
    profile.js            local identity (name shown to others)
    background.js          custom background image picker
    navigation.js           view switcher
    header.js                 clock, greeting, quote, alarm-check tick
    tasks.js                    tasks (CRUD), localStorage-backed
    alarms.js                    alarms, localStorage-backed
    dashboard.js                  dashboard's task/alarm summary panels
    pomodoro.js                    Pomodoro timer
    notes.js                        notes, localStorage-backed
    friends.js                       friends tabs (static/local, unchanged)
    webrtc.js                         camera/mic calling (mesh WebRTC)
    rooms.js                          rooms/chat/presence, Socket.IO-backed
    app.js                             bootstraps every feature on load
test/
  integration.js         server test (real server + socket.io-client)
  client.js              frontend test (real files + jsdom + mocks)
```
