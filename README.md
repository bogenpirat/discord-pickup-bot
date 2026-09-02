# Discord Pickup Bot

Coordinates pickup games for a video game. A member calls a pickup with `/valo`, the bot
posts one message to the channel the command was used in, pings a configured role, and
keeps a live tally of who is **Dabei**, **Später** (joining later), or **Raus**.

It also watches a configured channel for Steam store links to unreleased games. When one
is posted, the bot reacts with 👀 and tracks the game's release date; once it actually
launches, it replies to that message announcing it, with the German-region price if Steam
lists one.

German is the default language; English speakers get English command names and replies via
Discord's own locale.

## Commands

| Command | Who | What |
|---|---|---|
| `/valo [info]` | everyone | Posts a pickup call to the channel it was used in |
| `/valo-time <time>` | creator or config access | Sets the start time of the last pickup posted in this channel |
| `/pickup [info]` | everyone | Same as `/valo` |
| `/pickup-time <time>` | creator or config access | Same as `/valo-time` |
| `/pickup-config kanal <#channel>` | config access | Fallback channel, used only when the bot cannot post where `/valo` was called |
| `/pickup-config rolle [@role]` | config access | Role to mention, omit to clear |
| `/pickup-config emoji <option> [emoji]` | config access | Icon shown for one option, omit to reset |
| `/pickup-config zeitzone <tz>` | config access | IANA zone used to read start times |
| `/pickup-config anzeigen` | config access | Shows the current configuration |
| `/pickup-config admin-rolle [@role]` | **admins only** | Role allowed to use the commands above |
| `/pickup-config steam-kanal <#channel>` | config access | Channel watched for Steam store links |
| `/pickup-config steam-liste` | config access | Lists games currently being watched for release |
| `/pickup-config steam-entfernen <id>` | config access | Stops watching a game |
| `/valo-account verknüpfen <riot-id>` | everyone | Links your Riot ID, storing the PUUID behind it |
| `/valo-account anzeigen [@member]` | everyone | Shows a linked Riot ID |
| `/valo-account aktualisieren` | everyone | Re-reads your Riot ID after an account rename |
| `/valo-account trennen` | everyone | Deletes your stored Riot ID |
| `/valo-api status` | config access | Rate-limit usage and a live probe of the Valorant API |
| `/elo [riot-id]` | everyone | Your rank plus a chart of how it moved, with rank ups and downs marked |
| `/mmr [riot-id]` | everyone | Same as `/elo` |
| `/elo-private [riot-id]` | everyone | Same as `/elo`, answered only to you |
| `/mmr-private [riot-id]` | everyone | Same as `/elo-private` |
| `/last [riot-id]` | everyone | Summary and scoreboard of your last match |
| `/last-private [riot-id]` | everyone | Same as `/last`, answered only to you |

`/pickup` and `/pickup-time` are aliases: same options, same behaviour, whichever name is
easier to remember.

English clients see `/valo info:`, `/valo-time time:`,
`/pickup-config channel|role|timezone|emoji|show|admin-role|steam-channel|steam-list|steam-remove`
and `/valo-account link|show|refresh|unlink`.

The `/valo-account`, `/valo-api` and `/elo` commands need `VALORANT_API_KEY` in `.env`.
Without it they stay visible and say so when used; everything else works as before.

`/elo` and `/last` read the Riot ID you linked with `/valo-account`, so link once and they
need no arguments. The optional `riot-id:` looks someone else up instead and is limited to
config access — it spends the bot's rate limit on a player who never opted in.

Each has a `-private` twin that answers only to you. It is a separate command rather than an
option on purpose: it is one keystroke away, and nobody posts their rank to the channel by
forgetting to set a toggle. `/mmr` and `/mmr-private` are aliases of the `/elo` pair.

### Icons

Each of the three options shows an icon in the listing, defaulting to ✅ / 🕗 / ❌. Any of
them can be replaced per server:

```
/pickup-config emoji option:Dabei  emoji:🔥
/pickup-config emoji option:Später emoji:<:soon:123456789012345678>
/pickup-config emoji option:Raus                     ← omit to reset to the default
```

Both unicode emoji (including flags, keycaps and skin-tone variants) and custom server
emoji in `<:name:id>` / `<a:name:id>` form are accepted; anything else is refused with a
hint. Use emoji from **your own server**, since Discord will not render another server's
custom emoji for your members.

The icon appears both as the button decoration and in front of the field header, so
`✅ Dabei · 4` on the button matches `✅ Dabei (4)` in the listing. If a stored value ever
stops being a valid emoji, that option quietly falls back to its default rather than
breaking the message.

### Who may configure

*Config access* means any of:

1. **Manage Server** permission, or
2. a user ID listed in `POWER_USER_IDS` in `.env`, or
3. holding the role set via `/pickup-config admin-rolle`.

Setting the **admin role itself** is deliberately narrower — only 1 and 2. Otherwise
anyone holding the admin role could hand it to another role and widen access on their own.

`/valo-api status` uses the same three-way check, so whoever configures the bot can also
see whether the Valorant API is reachable and how much of the rate limit is left.

> `/pickup-config` and `/valo-api` intentionally carry no `default_member_permissions`,
> because Discord would then *hide* them from power users and admin-role holders entirely.
> They are visible to everyone and refuse at runtime instead.

### `/valo`

One optional free-text field. Anything you type goes in, and the bot pulls a start time out
of it opportunistically. **The text is never edited down** — it is shown in full as the note
on the message, time words included, so nothing a caller wrote can go missing.

| You type | Start time | Note |
|---|---|---|
| `/valo` | — | — |
| `/valo 20:30` | 20:30 | 20:30 |
| `/valo wer hat bock auf ranked um halb 9` | 20:30 | wer hat bock auf ranked um halb 9 |
| `/valo in 90 Minuten unrated` | now + 90 min | in 90 Minuten unrated |
| `/valo Sonntag 20 Uhr ranked` | next Sunday 20:00 | Sonntag 20 Uhr ranked |
| `/valo brauchen noch 2 leute` | — | brauchen noch 2 leute |

Recognised time formats, German and English:

- `20:30`, `20.30`, `20 Uhr`, `9:05`, `8pm`, `8:30 pm`
- `halb 9` → 20:30, `viertel nach 8` → 20:15, `viertel vor 9` → 20:45,
  `viertel 9` → 20:15, `dreiviertel 9` → 20:45, `half past 8`, `quarter to 9`
- `in 90 Minuten`, `in 1,5 Stunden`, `in einer halben Stunde`, `in 2h`, `gleich`
- `morgen 20:30`, `übermorgen 20 Uhr`, `heute 22:00`, `tomorrow 8pm`
- `Sonntag 20 Uhr`, `am Sonntag um 20:30`, `Sonntagabend 8`, `sunday 8pm`
- A filler `um`, `ab`, `gegen`, `at`, `around` or `@` in front of the time is ignored

A bare small hour means the evening: `8` is 20:00. Write `8:00` if you really mean the
morning. A time that has already passed rolls to the next day.

**Weekdays need a time.** `Sonntag 20 Uhr` is next Sunday at 20:00, but `Sonntagabend` on
its own sets no start time at all — the bot will not guess an hour, and the word still shows
up in the note. A weekday names today only while that time is still ahead; `Montag 8:00`
said on Monday afternoon means next Monday. Dayparts (`abend`, `morgen`, `evening`) are
read as part of the day word, not as an hour of their own.

A **bare number is only read as a time when it is the entire message**, so
`brauchen noch 2 leute` keeps its `2` instead of calling a game for 14:00. Write `20:30`,
`20 Uhr` or `halb 9` and it is picked up anywhere in the sentence.

Parsed times render as a Discord timestamp, so everyone sees them in their own timezone.
If no time is found, nothing is refused — the pickup is posted without a start time and the
bot points you at `/valo-time`.

### `/valo-time`

Corrects the start time of the **last pickup posted in the server**, for when the time was
missing, wrong, or only decided later. Usable by the pickup's creator and by anyone with
config access — Manage Server, a power user, or the configured admin role. Closed pickups
are refused.

| You type | Result |
|---|---|
| `/valo-time 20:30` | Start becomes 20:30, embed updates in place |
| `/valo-time Sonntag 20 Uhr` | Start becomes next Sunday 20:00 |
| `/valo-time in 90 Minuten` | Start becomes now + 90 min |
| `/valo-time irgendwann halt` | Shown verbatim as the start, with a hint about the formats |

It accepts the same formats as `/valo`, but reads the **whole** field as a time rather than
hunting for one inside a sentence. The note is left exactly as it was.

### Adding it to your calendar

A pickup with a **discrete start time** grows a second row of buttons: **📅 GCal** and
**📆 iCal**. Both describe the same event — titled `Gaming-Session @ <server name>`
(`Gaming session @ …` in English), starting at the pickup time and running two hours by
default, with a link back to the pickup message so the entry always points at the current
tally.

- **GCal** opens Google Calendar with the event prefilled, entirely in the URL.
- **iCal** downloads an `.ics` file for everything else — Apple Calendar, Outlook,
  Thunderbird, a CalDAV server. It only appears when `PUBLIC_BASE_URL` is set (see below);
  without it the row holds GCal alone.

They live on their own row because Discord allows five buttons per row and the responses
plus **Schließen** already fill one.

Both stay clickable on a closed pickup: closing ends the signups, not the game.

#### When the button appears

The row only exists when the time was actually recognised. A pickup without a time, or one
whose time is only shown verbatim (`/valo-time irgendwann halt`), has no calendar buttons —
there would be nothing to put in a start field. Filling the time in later with `/valo-time`
adds them to the existing message.

Because the message link is part of the Google event, `/valo` posts the message and then
rewrites it once Discord has handed out the message id. If that second write fails the
pickup stands as posted, only without the GCal button. The iCal button does not need the
message id, so it survives that failure.

#### The `.ics` is generated live

The file is not stored anywhere. Each download reads the pickup out of SQLite and builds
the document on the spot, so moving the time with `/valo-time` changes what the endpoint
serves without the Discord message being touched. It also means the endpoint keeps working
across a bot restart, and even if the original message is deleted.

Two things worth knowing:

- **Re-importing may not update an existing entry.** A pickup carries no revision counter,
  so the file has no `SEQUENCE`. Calendars that treat each downloaded file as fresh pick up
  a changed time on re-import; ones that match on `UID` and compare revisions may keep the
  original. Deleting the old entry first always works.
- **On mobile**, Discord opens link buttons in an in-app browser. The response is marked as
  a download, which hands off to the system calendar on iOS and Android, but a browser with
  downloads locked down may need the link opened externally instead.

#### Serving the file

The `.ics` comes from a small web server the bot runs itself, at
`<PUBLIC_BASE_URL>/pickup/calendar/<id>.ics`. It is **off unless `PUBLIC_BASE_URL` is set**,
and serves nothing else.

The endpoint is **unauthenticated**, and pickup ids are sequential, so anyone who can reach
the port can walk through them. What they would find is the event title, its start time and
a link to the message — all of it already visible in the channel the pickup was posted to.
Even so, keep the port on your own network or behind a reverse proxy rather than open to
the internet.

### Responding

Clicking a button records your choice. Clicking the **same** button again withdraws it;
clicking a different one switches it. The creator or anyone with Manage Server can close a
pickup, which disables the buttons. Any number of pickups can be open at once, and all
state lives in SQLite, so tallies survive a restart.

## Setting up the Discord application

You need two secrets from Discord — an **Application ID** and a **Bot Token** — plus an
invite that grants four permissions. Roughly ten minutes end to end.

### 1. Create the application

1. Go to <https://discord.com/developers/applications> and sign in.
2. **New Application**, give it a name (this is the name users see), accept the terms,
   **Create**.

### 2. Copy the Application ID

On **General Information**, copy **Application ID** — an 18–19 digit number.
This is `DISCORD_APP_ID` in your `.env`.

### 3. Create the bot token

1. Open the **Bot** tab in the left sidebar.
2. Click **Reset Token** (on a fresh app there is no token until you do), confirm, and
   copy the value **immediately** — Discord shows it exactly once. If you lose it, reset
   again; the old token stops working.
3. This is `DISCORD_TOKEN` in your `.env`.

> **Treat the token like a password.** Anyone holding it controls the bot. It must never
> be committed — `.env` is already in `.gitignore`. If it ever leaks, reset it in the
> portal, which instantly invalidates the old one.

### 4. Bot settings

Still on the **Bot** tab:

| Setting | Value | Why |
|---|---|---|
| **Public Bot** | **Off** | Only you can add it to servers. Turn on only if you want others to invite it. |
| **Requires OAuth2 Code Grant** | **Off** | Leave off, or invites will fail. |
| **Presence Intent** | **Off** | Not used. |
| **Server Members Intent** | **Off** | Not used. |
| **Message Content Intent** | **On** | Needed to detect Steam store links posted in the watched channel. |

Presence and Server Members stay **off**. Message Content Intent is **on**, since the bot
needs to read message text to detect Steam links in the configured channel — it only
inspects messages posted in that one channel, nothing else. This is a privileged intent:
bots in fewer than 100 servers can turn it on freely (as above), but growing past 100
servers requires Discord to review and approve it first.

### 5. Set the installation context

Open the **Installation** tab:

1. Under **Installation Contexts**, tick **Guild Install** and untick **User Install** —
   the commands are registered as guild-only and will not work in a user-install context.
2. Under **Install Link**, choose **None** if you plan to use the invite URL below, or
   **Discord Provided Link** and configure the same scopes and permissions as in step 6.

### 6. Build the invite URL

Open **OAuth2 → OAuth2 URL Generator**.

**Scopes** — tick exactly these two:

- `bot`
- `applications.commands` — required for slash commands; without it `/valo` never appears

**Bot Permissions** — tick exactly these five:

| Permission | Bit | Needed for |
|---|---|---|
| View Channel | 1024 | Seeing the channels pickups are called in, plus the Steam-watch channel |
| Send Messages | 2048 | Posting the pickup call and Steam release announcements |
| Embed Links | 16384 | The embeds holding the tally and the release announcement — without it those messages post empty |
| Add Reactions | 64 | Reacting 👀 on a message once the bot starts watching its Steam link |
| Mention @everyone, @here, and All Roles | 131072 | Pinging a role that is not itself mentionable (see below) |

That totals **`150592`**. Copy the generated URL at the bottom of the page, or build it
yourself — substitute your Application ID:

```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot%20applications.commands&permissions=150592
```

Open the URL, pick your server, **Authorize**. You need **Manage Server** on that server
to add a bot.

> **About the mention permission.** The bot sends `allowed_mentions` scoped to the single
> configured role, so it can never ping `@everyone` or anyone else regardless of what it
> holds. Discord still requires *Mention All Roles* to ping a role whose own
> "Allow anyone to @mention this role" setting is off. If you would rather not grant it,
> use permission integer **`19456`** instead and turn on that setting in
> **Server Settings → Roles → your role** — the ping then works without it.

### 7. Grant access to the target channel

Server-level permissions can be overridden per channel. In the channel you intend to use,
**Edit Channel → Permissions**, and confirm the bot's role has **View Channel**,
**Send Messages**, and **Embed Links** allowed. A red ✗ here silently overrides the
invite. `/valo` then falls back to the channel set with `/pickup-config kanal`, and says
so; with no fallback set it answers *"Ich kann hier nicht schreiben …"*.

Announcement channels also work; forum and voice channels do not.

### 8. Get your server ID (optional but recommended)

Set `DISCORD_DEV_GUILD_ID` and slash commands register to that one server **instantly**.
Leave it blank and they register globally, which Discord can take up to an hour to
propagate — use the guild-scoped route while setting up.

1. Discord app → **User Settings → Advanced → Developer Mode**, on.
2. Right-click your server icon → **Copy Server ID**.

### 9. Fill in `.env`

```sh
cp .env.example .env
```

```ini
DISCORD_TOKEN=the token from step 3
DISCORD_APP_ID=the id from step 2
DISCORD_DEV_GUILD_ID=the id from step 8   # optional; blank = register globally
POWER_USER_IDS=                           # optional; see below
PUBLIC_BASE_URL=                          # optional; blank = no web server, no iCal button
HTTP_PORT=18080                           # only used when PUBLIC_BASE_URL is set
VALORANT_API_KEY=                         # optional; blank = no /valo-account, no /valo-api
VALORANT_RATE_LIMIT_PER_MINUTE=30         # requests per minute your key allows
VALORANT_PLAYGROUND_SECRET=               # optional; blank = no API playground
```

`PUBLIC_BASE_URL` is the address the **iCal** button points at, so it has to be reachable
from the devices your members use — a LAN address or a hostname, not `localhost`. Include
the port unless a reverse proxy is fronting it:

```ini
PUBLIC_BASE_URL=http://pickup.example.net:18080
PUBLIC_BASE_URL=https://pickup.example.net     # behind a proxy on 443
```

The scheme is required; `pickup.example.net:18080` on its own is rejected at startup. Leave
the value blank and the bot never opens a port, exactly as it behaved before the feature
existed. See [Adding it to your calendar](#adding-it-to-your-calendar) for what the endpoint
exposes.

`POWER_USER_IDS` lists user IDs that may always use `/pickup-config`, regardless of their
server permissions — useful so you can configure the bot without holding Manage Server.
One ID, or several separated by commas. Copy an ID by right-clicking a user with Developer
Mode on (step 8) → **Copy User ID**.

`VALORANT_API_KEY` is a key from the [HenrikDev dashboard](https://docs.henrikdev.xyz). Leave
it blank and `/valo-account` and `/valo-api` refuse politely while the rest of the bot runs
unchanged. `VALORANT_RATE_LIMIT_PER_MINUTE` must match what your key actually allows — a
basic key gets 30. The bot queues its own requests to stay under that number, and on a `429`
backs off, holding every queued request until the API's own reset time has passed.

`VALORANT_PLAYGROUND_SECRET` additionally serves an API playground from the bot's own web
server, so it needs `PUBLIC_BASE_URL` set as well — see
[The API playground](#the-api-playground) for what it exposes and what guards it.

### 10. Start and register

```sh
docker compose up --build -d
docker compose run --rm bot node dist/scripts/deployCommands.js
```

Confirm it worked: `docker compose logs bot` shows `logged in`, and `docker compose ps`
reports `healthy` within about a minute.

### 11. Configure the bot in Discord

Run these once per server, as someone with **Manage Server** or a `POWER_USER_IDS` entry:

```
/pickup-config kanal       #pickup                 # optional; fallback when /valo cannot post where it was called
/pickup-config rolle       @Pickup
/pickup-config zeitzone    Europe/Berlin
/pickup-config admin-rolle @Orga          # optional; lets that role configure too
/pickup-config emoji       option:Dabei emoji:🔥   # optional; defaults are ✅ 🕗 ❌
/pickup-config steam-kanal #upcoming-games         # optional; enables the Steam release watcher
/pickup-config anzeigen
```

Then `/valo 20:30` to try it. If the commands do not appear, see below.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Commands do not appear | Registration script not run, or the `applications.commands` scope was missing from the invite — re-invite with the correct URL |
| Commands appear only after a long delay | `DISCORD_DEV_GUILD_ID` was blank, so they registered globally |
| `Invalid environment configuration` at startup | `DISCORD_TOKEN` or `DISCORD_APP_ID` missing from `.env` |
| `An invalid token was provided` | Token was reset in the portal, or copied with whitespace |
| Bot online but `/valo` says it cannot write | Channel permission override in this channel *and* in the fallback channel — see step 7 |
| Message posts but the role is not pinged | Missing *Mention All Roles*, and the role is not mentionable — see step 6 |
| Embed missing, message looks empty | *Embed Links* not granted |

### Following the Steam watcher

The release watcher logs what it is doing, so `docker compose logs -f bot` is enough to see
whether it is alive and what it thinks about each game (`LOG_LEVEL=debug` additionally shows
the links it decided not to watch):

| Log line | When |
|---|---|
| `steam watch poller started` | On boot, with the number of games tracked |
| `watching steam game for release` | On boot, once per tracked game — name, status, known release date, next check |
| `steam watch tick started` / `tick finished` | Each hourly check, with how many games were due and how they turned out |
| `now watching steam game for release` | A Steam link was posted and the bot started tracking that game |
| `steam game still unreleased, ...` | A checked game has not launched yet — with the release date if Steam now names one |
| `steam game released, announced in channel and stopped watching` | The release was found and the channel was notified |

Anything that goes wrong — a failed Steam lookup, an app that vanished from the store, a
channel the bot can no longer post in — is logged as a warning or error and retried.

## Running with Docker

```sh
cp .env.example .env      # fill in DISCORD_TOKEN and DISCORD_APP_ID
docker compose up --build -d
docker compose run --rm bot node dist/scripts/deployCommands.js
```

Setting `DISCORD_DEV_GUILD_ID` registers commands to that one guild instantly; leaving it
blank registers globally, which can take up to an hour to propagate.

The SQLite file lives on the `pickup-data` volume at `/data/pickup.db`. The container runs
as the non-root `node` user and reports unhealthy if the gateway connection goes stale.

`docker-compose.yml` publishes `${HTTP_PORT:-18080}` on both sides of the mapping, so
changing `HTTP_PORT` in `.env` moves the container port and the host port together. Nothing
listens on it unless `PUBLIC_BASE_URL` is set. The health check is unrelated to the web
server — it probes a heartbeat file, not the port.

## The audit log

Every slash command and every button click is appended to `audit.log` as one line of JSON,
listing the Valorant API requests that interaction caused. `docker-compose.yml` bind-mounts
`./audit` into the container, so the record sits next to `docker-compose.yml` on the host
and outlives any `docker compose down`.

On Linux, create the directory before the first start — Docker would otherwise create it
owned by root, and the container runs as uid 1000:

```sh
mkdir -p audit && sudo chown 1000:1000 audit
```

Docker Desktop on Windows and macOS remaps ownership, so there the directory needs nothing.
If the log is ever unwritable the bot logs one warning and carries on serving commands; it
never fails an interaction over an audit entry.

Outside Docker the log is off unless `AUDIT_LOG_PATH` is set.

One line, wrapped here for reading:

```json
{
  "ts": "2026-09-02T18:41:07.223Z", "v": 1, "kind": "command", "command": "elo",
  "guildId": "1234", "channelId": "9876", "userId": "4242", "user": "julian",
  "locale": "de", "options": { "riot-id": "Foo#EUW" },
  "outcome": "ok", "durationMs": 842,
  "apiCalls": [
    { "method": "GET", "path": "/valorant/v2/account/Foo/EUW",
      "query": { "force": true }, "status": 200, "attempts": 1, "durationMs": 310 },
    { "method": "GET", "path": "/valorant/v3/mmr/eu/pc/Foo/EUW",
      "status": 200, "attempts": 1, "durationMs": 404 }
  ]
}
```

| Field | Meaning |
|---|---|
| `ts` | When the interaction started, not when the line was written |
| `v` | Schema version, so a reader can tell old lines from new ones |
| `kind` | `command` or `button` |
| `command`, `subcommand`, `options` | Commands only. `subcommand` is absent when there is none |
| `action`, `pickupId`, `choice` | Buttons only. `choice` is absent on a close |
| `outcome` | `ok`, or `error` with the thrown message in `error` |
| `apiCalls[].attempts` | Wire attempts, so `3` means it was retried twice |
| `apiCalls[].durationMs` | The whole request, including rate-limiter queueing and backoff |
| `apiCalls[].status` | Status of the last attempt, or `0` when nothing ever answered |
| `apiCalls[].error` | The `ValorantError` kind, absent when the call succeeded |

Request bodies and headers are never written, so the API key cannot reach the file. Requests
the bot makes on its own — the content dump it loads at startup, the Steam watcher, the API
playground — belong to no interaction and are not recorded.

Reading it:

```sh
tail -f audit/audit.log | jq -c              # follow along
jq -c 'select(.userId == "4242")' audit/audit.log
jq -r 'select(.apiCalls | length > 0) | .command' audit/audit.log | sort | uniq -c | sort -rn
jq -c 'select(.outcome == "error")' audit/audit.log
jq -c 'select(.apiCalls[]?.attempts > 1)' audit/audit.log   # what got retried
```

Nothing rotates the file. It is one short line per interaction, so a busy month is a few
megabytes; point `logrotate` at it if that ever stops being true.

## Local development

Requires Node 26+ (for `node:sqlite` and `Temporal`, both used without any dependency).

```sh
npm install
npm run dev        # node --watch, runs TypeScript directly
npm run deploy     # register slash commands
npm run check      # biome + tsc + tests with coverage thresholds
```

| Script | Purpose |
|---|---|
| `npm run dev` | Run from source with watch mode |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled bot |
| `npm test` | Run the test suite |
| `npm run coverage` | Tests plus enforced coverage thresholds |
| `npm run lint` / `npm run format` | Biome check / write |
| `npm run typecheck` | `tsc` with full strictness |
| `npm run gen:valorant:fetch` | Re-download the HenrikDev OpenAPI spec |
| `npm run gen:valorant` | Regenerate the Valorant API types from that spec |

### The Valorant API client

`src/valorant/` wraps the [HenrikDev API](https://api.henrikdev.xyz) with one method per
documented endpoint, each at its latest version. Response types are **generated** from the
API's own OpenAPI spec, and both the spec snapshot and the generated types are committed:

```sh
npm run gen:valorant:fetch   # src/valorant/generated/openapi.json
npm run gen:valorant         # src/valorant/generated/schema.ts
```

Committing both keeps CI off the network and makes an upstream API change show up as a
reviewable diff. The generator runs through `npx` rather than as a devDependency, because
`openapi-typescript` still pins TypeScript 5 as a peer while this repo is on 7. Nothing
in the build, test or lint path needs it — `src/valorant/generated/` is excluded from Biome
and from coverage.

Every method answers a `Result`, never a thrown error:

```ts
const account = await context.valorant?.getAccount('Name', 'EUW');
if (account?.ok) {
  account.value.puuid;   // fully typed from the spec
}
```

Requests are admitted by a shared sliding-window rate limiter sized to
`VALORANT_RATE_LIMIT_PER_MINUTE`, and a `429` backs off with jitter, honouring `Retry-After`
and `X-RateLimit-Reset` and holding every queued request until the reset has passed. A
Riot ID is stored as its **PUUID** (`riot_accounts`), because that is the identifier that
survives an account rename; the name and tag are cached alongside it and refreshed by
`/valo-account aktualisieren`.

### Naming the ids

Much of what the API answers with is a bare uuid: a player's card and title, the act a peak
rank was set in, the weapon behind a kill, the ceremony a round ended with. The only place
those are named is `GET /valorant/v1/content`, a dump of the game build's entities.

`src/valorant/contentCatalog.ts` reads it **once**, just after the gateway handshake, and
`src/domain/valorant/content.ts` turns it into a lookup table — by id, and by asset path,
which is how the raw endpoints name maps and game modes. The dump describes the *build*, so
it goes stale with a patch rather than with a match; re-reading it per command would spend
the rate limit on data that has not moved.

```ts
context.content.findIn('playerCards', player.customization.card)?.name;
context.content.seasonLabel(mmr.peak.season.id);   // "V26 · AKT V", where the API said "e11a5"
context.content.ceremony(round.ceremony)?.name;    // "CeremonyFlawless" -> "MAKELLOS"
context.content.find('/Game/Maps/Jam/Jam')?.name;  // "Lotus", for the raw endpoints
```

Two things about it are worth knowing. The dump is **localised per request**, so one call
answers for one language: the bot asks for `de-DE` and every name it resolves is German —
a second language means a second dump, keyed by locale, not a translation of this one. And
it is entirely optional: before it has loaded, without an API key, or if the call fails,
every lookup answers `null` and each call site falls back to what the API sent — the short
season code, or the id itself. Nothing waits on it and nothing fails with it.

Not everything resolves. Level borders, party ids, team ids and puuids are not in the dump,
and the competitive tier is a ladder position rather than an entity — `src/domain/valorant/tier.ts`
names those.

The dump names entities but does not picture them, and Riot publishes no image endpoint.
`src/domain/valorant/media.ts` builds artwork URLs on `media.valorant-api.com`, the community
mirror HenrikDev's own v1 account endpoint answers with — so `/valo-account verknüpfen`
shows the linked account's player card as a thumbnail without spending a second request, and
captions it with the card's name when the dump has been read. Ids are checked against a uuid
pattern before they go into a URL Discord will fetch; an id the mirror does not have costs
the picture and nothing else.

### The rank chart

`/elo` draws its chart in-process and attaches it to the reply, so it needs no web server and
no image dependency. `src/lib/image/` is a PNG encoder (`node:zlib` does the compression), a
small rasterizer and a 5x7 bitmap font; `src/ui/mmrChart.ts` composes them.

The y-axis bands are not a hardcoded rank table. `elo` is a tier's base plus the rank rating
inside it, so `elo - rr` lands exactly on the tier boundary — the chart keeps labelling itself
correctly when Riot renames or adds a tier. Rank ups and downs come from comparing `tier.id`
between consecutive matches, and are drawn as a marker, a guide line and a label; labels that
would collide are pushed into a further lane.

One `/elo` costs about four requests against the rate limit: both MMR endpoints are
Riot-backed, and the API counts its own upstream call as well as yours. `/last` asks for a
single match and costs about two.

### The match summary

`/last` fetches the one most recent match by **puuid** — the identifier that survives a
rename — and reduces it to that player's view of it in `src/domain/valorant/matchSummary.ts`:
the scoreline from their side, win/loss/draw, their own K/D/A, ACS, ADR and headshot share,
and both scoreboards sorted by combat score with their own row marked.

Per-round averages divide by the rounds *both* teams played, so ACS and ADR match what the
in-game scoreboard showed. The scoreboards are rendered in a code block because Discord's
proportional font turns a column of numbers into a staircase.

### The API playground

Set `VALORANT_PLAYGROUND_SECRET` and the bot's web server also serves a single-page
playground for the client above:

```
<PUBLIC_BASE_URL>/pickup/<VALORANT_PLAYGROUND_SECRET>/valorant-playground
```

It sits under the same `/pickup` prefix as the calendar route, so a reverse proxy that
already forwards `/pickup/*` to the bot needs no extra rule. The exact URL is printed once
at startup — `docker compose logs bot | grep playground`.

Pick an endpoint, fill the form it generates, and the reply comes back as formatted JSON
with the rate-limit state next to it, and above it every id in the answer that the content
dump can name — which is most of what makes a raw payload unreadable. The form is built from `src/valorant/catalog.ts`, a
declarative description of every endpoint whose `invoke` calls the real typed client method
— so an endpoint added to the client and the catalog shows up in the playground with no page
changes. The crosshair endpoint renders its PNG instead of printing bytes.

Generate the secret with something like `openssl rand -hex 24`; the config rejects anything
under 24 characters or not URL-safe.

> **Be clear about what this is.** An unguessable URL is the *only* thing in front of it —
> there is no login. Anyone with the link can spend your rate limit and read any public
> Valorant profile through your key. It is off unless the secret is set, it never appears in
> a log line except once at startup, and it is served `noindex` and `no-store`, but treat
> the URL as a credential. The four premium webhook **mutations** are implemented on the
> client but deliberately left out of the playground, so a leaked URL cannot rewrite your
> webhook subscriptions.

Requests go through the same limiter as the Discord commands, so the playground cannot push
the bot over its quota — it just queues behind everything else.

## Layout

```
src/domain/     pure logic: time parsing, calendar links, response transitions (no discord.js, no SQL)
src/db/         schema, migrations, repositories
src/ui/         renders domain values into Discord messages, de/en strings
src/discord/    client, custom ids, command and button dispatch
src/http/       the bot's own web server: socket, route table, one route per file
src/commands/   one file per slash command
src/buttons/    one file per button action
src/valorant/   HenrikDev API client, with types generated from its OpenAPI spec
src/lib/image/  a small PNG encoder and rasterizer, used to draw the /elo chart
src/audit/      one record per interaction: its scope, its shape, its file sink
src/app/        composition: context and registries
```

`domain/` imports nothing from Discord or the database, which is why it can be tested
exhaustively against a fixed clock.
