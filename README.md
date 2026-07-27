# Discord Pickup Bot

Coordinates pickup games for a video game. A member calls a pickup with `/pickup`, the bot
posts one message to a configured channel, pings a configured role, and keeps a live tally
of who is **Dabei**, **Wenn mehr**, or **Raus**.

German is the default language; English speakers get English command names and replies via
Discord's own locale.

## Commands

| Command | Who | What |
|---|---|---|
| `/pickup [zeit] [notiz]` | everyone | Posts a pickup call to the configured channel |
| `/pickup-config kanal <#channel>` | Manage Server | Where pickup calls are posted |
| `/pickup-config rolle [@role]` | Manage Server | Role to mention, omit to clear |
| `/pickup-config zeitzone <tz>` | Manage Server | IANA zone used to read start times |
| `/pickup-config anzeigen` | Manage Server | Shows the current configuration |

English clients see `/pickup time: note:` and `/pickup-config channel|role|timezone|show`.

### Start times

The `zeit` option is optional and understands German and English:

- `20:30`, `20.30`, `20 Uhr`, `9:05`, `8pm`, `8:30 pm`
- `halb 9` → 20:30, `viertel nach 8` → 20:15, `viertel vor 9` → 20:45,
  `viertel 9` → 20:15, `dreiviertel 9` → 20:45, `half past 8`, `quarter to 9`
- `in 90 Minuten`, `in 1,5 Stunden`, `in einer halben Stunde`, `in 2h`, `gleich`
- `morgen 20:30`, `übermorgen 20 Uhr`, `heute 22:00`, `tomorrow 8pm`

A bare small hour means the evening: `8` is 20:00. Write `8:00` if you really mean the
morning. A time that has already passed rolls to the next day.

Parsed times render as a Discord timestamp, so everyone sees them in their own timezone.
Anything the parser cannot read is shown verbatim instead — nothing is ever refused.

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
| **Message Content Intent** | **Off** | Not used — the bot never reads message text. |

All three privileged intents stay **off**. This bot connects with only the non-privileged
`Guilds` intent, so it needs no approval or review, at any server count.

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
- `applications.commands` — required for slash commands; without it `/pickup` never appears

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
invite, and `/pickup` will answer *"Ich kann im konfigurierten Kanal nicht schreiben."*

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
```

### 10. Start and register

```sh
docker compose up --build -d
docker compose run --rm bot node dist/scripts/deployCommands.js
```

Confirm it worked: `docker compose logs bot` shows `logged in`, and `docker compose ps`
reports `healthy` within about a minute.

### 11. Configure the bot in Discord

Run these once per server, as someone with **Manage Server**:

```
/pickup-config kanal   #pickup
/pickup-config rolle   @Pickup
/pickup-config zeitzone Europe/Berlin
/pickup-config anzeigen
```

Then `/pickup zeit:20:30` to try it. If the commands do not appear, see below.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Commands do not appear | Registration script not run, or the `applications.commands` scope was missing from the invite — re-invite with the correct URL |
| Commands appear only after a long delay | `DISCORD_DEV_GUILD_ID` was blank, so they registered globally |
| `Invalid environment configuration` at startup | `DISCORD_TOKEN` or `DISCORD_APP_ID` missing from `.env` |
| `An invalid token was provided` | Token was reset in the portal, or copied with whitespace |
| Bot online but `/pickup` says it cannot write | Channel permission override — see step 7 |
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
