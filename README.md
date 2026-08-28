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

`/pickup` and `/pickup-time` are aliases: same options, same behaviour, whichever name is
easier to remember.

English clients see `/valo info:`, `/valo-time time:` and
`/pickup-config channel|role|timezone|emoji|show|admin-role|steam-channel|steam-list|steam-remove`.

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

> `/pickup-config` intentionally carries no `default_member_permissions`, because Discord
> would then *hide* it from power users and admin-role holders entirely. It is visible to
> everyone and refuses at runtime instead.

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

## Layout

```
src/domain/     pure logic: time parsing, calendar links, response transitions (no discord.js, no SQL)
src/db/         schema, migrations, repositories
src/ui/         renders domain values into Discord messages, de/en strings
src/discord/    client, custom ids, command and button dispatch
src/http/       the bot's own web server: socket, route table, one route per file
src/commands/   one file per slash command
src/buttons/    one file per button action
src/app/        composition: context and registries
```

`domain/` imports nothing from Discord or the database, which is why it can be tested
exhaustively against a fixed clock.
