# Discord Pickup Bot

Coordinates pickup games for a video game. A member calls a pickup with `/valo`, the bot
posts one message to a configured channel, pings a configured role, and keeps a live tally
of who is **Dabei**, **Später** (joining later), or **Raus**.

It also watches a configured channel for Steam store links to unreleased games. When one
is posted, the bot tracks the game's release date and, once it actually launches, replies
to that message announcing it, with the German-region price if Steam lists one.

German is the default language; English speakers get English command names and replies via
Discord's own locale.

## Commands

| Command | Who | What |
|---|---|---|
| `/valo [info]` | everyone | Posts a pickup call to the configured channel |
| `/pickup-config kanal <#channel>` | config access | Where pickup calls are posted |
| `/pickup-config rolle [@role]` | config access | Role to mention, omit to clear |
| `/pickup-config emoji <option> [emoji]` | config access | Icon shown for one option, omit to reset |
| `/pickup-config zeitzone <tz>` | config access | IANA zone used to read start times |
| `/pickup-config anzeigen` | config access | Shows the current configuration |
| `/pickup-config admin-rolle [@role]` | **admins only** | Role allowed to use the commands above |
| `/pickup-config steam-kanal <#channel>` | config access | Channel watched for Steam store links |
| `/pickup-config steam-liste` | config access | Lists games currently being watched for release |
| `/pickup-config steam-entfernen <id>` | config access | Stops watching a game |

English clients see `/valo info:` and
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
of it opportunistically; whatever is left over becomes the note shown on the message.

| You type | Start time | Note |
|---|---|---|
| `/valo` | — | — |
| `/valo 20:30` | 20:30 | — |
| `/valo wer hat bock auf ranked um halb 9` | 20:30 | wer hat bock auf ranked |
| `/valo in 90 Minuten unrated` | now + 90 min | unrated |
| `/valo morgen 20:30 ranked grind` | tomorrow 20:30 | ranked grind |
| `/valo brauchen noch 2 leute` | — | brauchen noch 2 leute |

Recognised time formats, German and English:

- `20:30`, `20.30`, `20 Uhr`, `9:05`, `8pm`, `8:30 pm`
- `halb 9` → 20:30, `viertel nach 8` → 20:15, `viertel vor 9` → 20:45,
  `viertel 9` → 20:15, `dreiviertel 9` → 20:45, `half past 8`, `quarter to 9`
- `in 90 Minuten`, `in 1,5 Stunden`, `in einer halben Stunde`, `in 2h`, `gleich`
- `morgen 20:30`, `übermorgen 20 Uhr`, `heute 22:00`, `tomorrow 8pm`

A bare small hour means the evening: `8` is 20:00. Write `8:00` if you really mean the
morning. A time that has already passed rolls to the next day. A filler `um`, `ab` or
`gegen` in front of the time is dropped from the note.

A **bare number is only read as a time when it is the entire message**, so
`brauchen noch 2 leute` keeps its `2` instead of calling a game for 14:00. Write `20:30`,
`20 Uhr` or `halb 9` and it is picked up anywhere in the sentence.

Parsed times render as a Discord timestamp, so everyone sees them in their own timezone.
If no time is found, nothing is refused — the whole text simply becomes the note.

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

**Bot Permissions** — tick exactly these four:

| Permission | Bit | Needed for |
|---|---|---|
| View Channel | 1024 | Seeing the configured pickup channel |
| Send Messages | 2048 | Posting the pickup call |
| Embed Links | 16384 | The embed holding the tally — without it the message posts empty |
| Mention @everyone, @here, and All Roles | 131072 | Pinging a role that is not itself mentionable (see below) |

That totals **`150528`**. Copy the generated URL at the bottom of the page, or build it
yourself — substitute your Application ID:

```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot%20applications.commands&permissions=150528
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
invite, and `/valo` will answer *"Ich kann im konfigurierten Kanal nicht schreiben."*

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
```

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
/pickup-config kanal       #pickup
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
| Bot online but `/valo` says it cannot write | Channel permission override — see step 7 |
| Message posts but the role is not pinged | Missing *Mention All Roles*, and the role is not mentionable — see step 6 |
| Embed missing, message looks empty | *Embed Links* not granted |

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
src/domain/     pure logic: time parsing, response transitions (no discord.js, no SQL)
src/db/         schema, migrations, repositories
src/ui/         renders domain values into Discord messages, de/en strings
src/discord/    client, custom ids, command and button dispatch
src/commands/   one file per slash command
src/buttons/    one file per button action
src/app/        composition: context and registries
```

`domain/` imports nothing from Discord or the database, which is why it can be tested
exhaustively against a fixed clock.
