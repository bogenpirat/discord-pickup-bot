import type { SteamWatchRecord } from '../../db/repositories/steamWatchRepository.ts';
import type {
  DirectoryChannel,
  DirectoryGuild,
  DirectoryGuildDetail,
  DirectoryRole,
} from '../../discord/guildDirectory.ts';
import { DEFAULT_CHOICE_EMOJI, PICKUP_CHOICES } from '../../domain/pickupChoice.ts';
import type { AppLocale } from '../../ui/strings.ts';
import { stringsFor } from '../../ui/strings.ts';
import {
  ADMIN_BASE_PATH,
  guildPath,
  loginPath,
  logoutPath,
  steamWatchRemovePath,
} from './paths.ts';
import type { FormField, FormProblems, SettingsDraft } from './settingsForm.ts';
import type { ConsoleStrings } from './strings.ts';

/** Nothing but inline styles and Discord's own guild icons; no scripts at all. */
export const CONSOLE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src https://cdn.discordapp.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const STYLE = `
:root { color-scheme: light; --bg:#f4f4f6; --panel:#ffffff; --raised:#f0f1f4; --line:#dcdde3;
        --text:#1d1e22; --muted:#62646d; --accent:#5865f2; --accent-ink:#ffffff;
        --ok:#1f7a4d; --ok-bg:#e3f4ea; --bad:#b3261e; --bad-bg:#fbe9e7; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; --bg:#111214; --panel:#1a1b1e; --raised:#232428;
        --line:#2e3035; --text:#ebebee; --muted:#9b9ca3; --accent:#7983f5; --accent-ink:#0d0e1a;
        --ok:#6fd39d; --ok-bg:#16291f; --bad:#f2948c; --bad-bg:#2e1715; }
}
:root[data-theme="dark"] { color-scheme: dark; --bg:#111214; --panel:#1a1b1e; --raised:#232428;
        --line:#2e3035; --text:#ebebee; --muted:#9b9ca3; --accent:#7983f5; --accent-ink:#0d0e1a;
        --ok:#6fd39d; --ok-bg:#16291f; --bad:#f2948c; --bad-bg:#2e1715; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { min-height: 100vh; background: var(--bg); color: var(--text);
       font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--accent); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px;
       padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
.brand { color: var(--text); font-weight: 700; text-decoration: none; }
main { width: 100%; max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
main.narrow { max-width: 400px; padding-top: 12vh; }
h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.25; overflow-wrap: anywhere; }
h2 { margin: 0; font-size: 17px; }
.lead { margin: 0 0 20px; color: var(--muted); }
.card { margin: 0 0 16px; padding: 18px 18px 6px; background: var(--panel); border: 1px solid var(--line);
        border-radius: 12px; }
.card > header { margin: 0 0 14px; }
.card > header p { margin: 2px 0 0; color: var(--muted); font-size: 14px; }
.field { margin: 0 0 14px; }
.field label { display: block; margin: 0 0 4px; font-weight: 600; font-size: 14px; }
.field .hint { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.field .error { margin: 4px 0 0; color: var(--bad); font-size: 13px; font-weight: 600; }
input, select { width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px;
                background: var(--raised); color: var(--text); font: inherit; }
input[aria-invalid="true"], select[aria-invalid="true"] { border-color: var(--bad); }
input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px; }
input::placeholder { color: var(--muted); opacity: 1; }
/* A default icon shows as a placeholder; faded, so it never reads as a stored value. */
.icons input::placeholder { opacity: .35; }
.icons { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0 12px; }
button { padding: 9px 16px; border: 0; border-radius: 8px; background: var(--accent); color: var(--accent-ink);
         font: inherit; font-weight: 700; cursor: pointer; }
button.quiet { background: transparent; color: var(--muted); border: 1px solid var(--line); font-weight: 600; }
button.quiet:hover { color: var(--text); }
.actions { position: sticky; bottom: 0; display: flex; justify-content: flex-end; margin: 0 0 16px;
           padding: 12px 0; background: linear-gradient(transparent, var(--bg) 35%); }
.flash { margin: 0 0 16px; padding: 10px 14px; border-radius: 8px; font-weight: 600; }
.flash.ok { background: var(--ok-bg); color: var(--ok); }
.flash.bad { background: var(--bad-bg); color: var(--bad); }
.servers { margin: 0; padding: 0; list-style: none; }
.servers a { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; padding: 12px 14px;
             background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
             color: var(--text); text-decoration: none; font-weight: 600; }
.servers a:hover { border-color: var(--accent); }
.avatar { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%;
          background: var(--raised); color: var(--muted); font-weight: 700; overflow: hidden; }
.avatar img { width: 100%; height: 100%; }
.heading { display: flex; align-items: center; gap: 12px; margin: 8px 0 20px; }
.back { font-size: 14px; }
.watches { margin: 0 0 12px; padding: 0; list-style: none; }
.watches li { display: flex; align-items: center; justify-content: space-between; gap: 12px;
              padding: 10px 0; border-top: 1px solid var(--line); }
.watches li:first-child { border-top: 0; }
.watches .when { display: block; color: var(--muted); font-size: 13px; }
.empty { margin: 0 0 14px; color: var(--muted); }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
`;

interface LayoutOptions {
  readonly locale: AppLocale;
  readonly strings: ConsoleStrings;
  readonly title: string;
  /** Present once signed in; adds the sign-out button to the header. */
  readonly csrfToken?: string;
  readonly narrow?: boolean;
  readonly body: string;
}

const layout = (options: LayoutOptions): string => {
  const signOut =
    options.csrfToken === undefined
      ? ''
      : `<form method="post" action="${logoutPath()}">${csrfInput(options.csrfToken)}<button class="quiet" type="submit">${escapeHtml(options.strings.logout)}</button></form>`;

  return `<!doctype html>
<html lang="${options.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(options.title)} · ${escapeHtml(options.strings.brand)}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="top"><a class="brand" href="${ADMIN_BASE_PATH}/">${escapeHtml(options.strings.brand)}</a>${signOut}</header>
<main${options.narrow === true ? ' class="narrow"' : ''}>
${options.body}
</main>
</body>
</html>`;
};

const csrfInput = (token: string): string =>
  `<input type="hidden" name="csrf" value="${escapeHtml(token)}">`;

const flash = (kind: 'ok' | 'bad', message: string): string =>
  `<p class="flash ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(message)}</p>`;

export interface LoginPageView {
  readonly locale: AppLocale;
  readonly strings: ConsoleStrings;
  readonly username?: string;
  readonly error?: string;
}

export const loginPage = (view: LoginPageView): string =>
  layout({
    locale: view.locale,
    strings: view.strings,
    title: view.strings.loginHeading,
    narrow: true,
    body: `<h1>${escapeHtml(view.strings.loginHeading)}</h1>
<p class="lead">${escapeHtml(view.strings.loginIntro)}</p>
${view.error === undefined ? '' : flash('bad', view.error)}
<form class="card" method="post" action="${loginPath()}">
<div class="field"><label for="username">${escapeHtml(view.strings.username)}</label>
<input id="username" name="username" autocomplete="username" required autofocus value="${escapeHtml(view.username ?? '')}"></div>
<div class="field"><label for="password">${escapeHtml(view.strings.password)}</label>
<input id="password" name="password" type="password" autocomplete="current-password" required></div>
<div class="field"><button type="submit">${escapeHtml(view.strings.loginButton)}</button></div>
</form>`,
  });

const avatar = (guild: DirectoryGuild): string =>
  guild.iconUrl === null
    ? `<span class="avatar" aria-hidden="true">${escapeHtml([...guild.name][0] ?? '?')}</span>`
    : `<span class="avatar"><img src="${escapeHtml(guild.iconUrl)}" alt=""></span>`;

export interface ServerListView {
  readonly locale: AppLocale;
  readonly strings: ConsoleStrings;
  readonly csrfToken: string;
  readonly guilds: readonly DirectoryGuild[];
}

export const serverListPage = (view: ServerListView): string =>
  layout({
    locale: view.locale,
    strings: view.strings,
    title: view.strings.serversHeading,
    csrfToken: view.csrfToken,
    body: `<h1>${escapeHtml(view.strings.serversHeading)}</h1>
<p class="lead">${escapeHtml(view.guilds.length === 0 ? view.strings.serversEmpty : view.strings.serversIntro)}</p>
<ul class="servers">${view.guilds
      .map(
        (guild) =>
          `<li><a href="${guildPath(guild.id)}">${avatar(guild)}<span>${escapeHtml(guild.name)}</span></a></li>`,
      )
      .join('')}</ul>`,
  });

export interface GuildPageView {
  readonly locale: AppLocale;
  readonly strings: ConsoleStrings;
  readonly csrfToken: string;
  readonly guild: DirectoryGuildDetail;
  readonly draft: SettingsDraft;
  readonly problems: FormProblems;
  readonly notice?: 'saved' | 'watchRemoved';
  readonly watches: readonly SteamWatchRecord[];
  /** Every zone the runtime knows, offered as suggestions for the time zone field. */
  readonly timeZones: readonly string[];
  /** Renders a release date the way the guild reads times. */
  readonly formatDate: (epochMilliseconds: number) => string;
}

interface Option {
  readonly value: string;
  readonly label: string;
}

const fieldShell = (
  view: GuildPageView,
  field: FormField,
  label: string,
  control: string,
  hint?: string,
): string => {
  const problem = view.problems.get(field);
  return `<div class="field"><label for="${field}">${escapeHtml(label)}</label>
${control}${hint === undefined ? '' : `<p class="hint" id="${field}-hint">${escapeHtml(hint)}</p>`}${problem === undefined ? '' : `<p class="error" id="${field}-error">${escapeHtml(view.strings.problem[problem])}</p>`}</div>`;
};

const describedBy = (view: GuildPageView, field: FormField, hasHint: boolean): string => {
  const ids = [
    ...(hasHint ? [`${field}-hint`] : []),
    ...(view.problems.has(field) ? [`${field}-error`] : []),
  ];
  const invalid = view.problems.has(field) ? ' aria-invalid="true"' : '';
  return `${ids.length === 0 ? '' : ` aria-describedby="${ids.join(' ')}"`}${invalid}`;
};

/**
 * A dropdown over what the server has. A stored value Discord no longer knows
 * stays selectable under a warning, so saving the form keeps it rather than
 * quietly clearing it.
 */
const selectField = (
  view: GuildPageView,
  field: FormField,
  label: string,
  emptyLabel: string,
  options: readonly Option[],
  hint?: string,
): string => {
  const selected = view.draft[field];
  const all =
    selected !== '' && !options.some((option) => option.value === selected)
      ? [...options, { value: selected, label: `⚠ ${view.strings.missingOption(selected)}` }]
      : options;

  const control = `<select id="${field}" name="${field}"${describedBy(view, field, hint !== undefined)}>
<option value="">${escapeHtml(emptyLabel)}</option>${all
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`,
    )
    .join('')}</select>`;

  return fieldShell(view, field, label, control, hint);
};

const channelOptions = (channels: readonly DirectoryChannel[], strings: ConsoleStrings): Option[] =>
  channels.map((channel) => ({
    value: channel.id,
    label: `#${channel.name}${channel.kind === 'announcement' ? ` (${strings.announcement})` : ''}`,
  }));

const roleOptions = (roles: readonly DirectoryRole[]): Option[] =>
  roles.map((role) => ({ value: role.id, label: `@${role.name}` }));

const section = (heading: string, intro: string | null, body: string): string =>
  `<section class="card"><header><h2>${escapeHtml(heading)}</h2>${intro === null ? '' : `<p>${escapeHtml(intro)}</p>`}</header>${body}</section>`;

const watchList = (view: GuildPageView): string => {
  if (view.watches.length === 0) {
    return `<p class="empty">${escapeHtml(view.strings.watchesEmpty)}</p>`;
  }

  return `<ul class="watches">${view.watches
    .map((watch) => {
      const when =
        watch.status === 'scheduled' && watch.releaseDate !== null
          ? view.formatDate(watch.releaseDate)
          : (watch.releaseDateText ?? view.strings.watchPending);
      return `<li><span>${escapeHtml(watch.gameName)}<span class="when">${escapeHtml(when)}</span></span>
<form method="post" action="${steamWatchRemovePath(view.guild.id, watch.id)}">${csrfInput(view.csrfToken)}<button class="quiet" type="submit">${escapeHtml(view.strings.remove)}</button></form></li>`;
    })
    .join('')}</ul>`;
};

export const guildPage = (view: GuildPageView): string => {
  const { strings, guild } = view;
  const channels = channelOptions(guild.channels, strings);
  const roles = roleOptions(guild.roles);
  const choiceLabels = stringsFor(view.locale).choice;

  const notice =
    view.problems.size > 0
      ? flash('bad', strings.fixProblems)
      : view.notice === 'saved'
        ? flash('ok', strings.saved)
        : view.notice === 'watchRemoved'
          ? flash('ok', strings.watchRemoved)
          : '';

  const iconFields = PICKUP_CHOICES.map((choice) => {
    const field = `emoji_${choice}` as const;
    const control = `<input id="${field}" name="${field}" maxlength="64" placeholder="${escapeHtml(DEFAULT_CHOICE_EMOJI[choice])}" value="${escapeHtml(view.draft[field])}"${describedBy(view, field, false)}>`;
    return fieldShell(view, field, choiceLabels[choice], control);
  }).join('');

  const timezoneControl = `<input id="timezone" name="timezone" list="timezones" required autocomplete="off" spellcheck="false" value="${escapeHtml(view.draft.timezone)}"${describedBy(view, 'timezone', true)}>
<datalist id="timezones">${view.timeZones.map((zone) => `<option value="${escapeHtml(zone)}">`).join('')}</datalist>`;

  return layout({
    locale: view.locale,
    strings,
    title: guild.name,
    csrfToken: view.csrfToken,
    body: `<a class="back" href="${ADMIN_BASE_PATH}/">← ${escapeHtml(strings.allServers)}</a>
<div class="heading">${avatar(guild)}<h1>${escapeHtml(guild.name)}</h1></div>
${notice}
<form method="post" action="${guildPath(guild.id)}">
${csrfInput(view.csrfToken)}
${section(
  strings.gameHeading,
  strings.gameIntro,
  selectField(view, 'mention_role', strings.role, strings.noRole, roles, strings.roleHint) +
    selectField(
      view,
      'pickup_channel',
      strings.fallbackChannel,
      strings.noChannel,
      channels,
      strings.fallbackChannelHint,
    ),
)}
${section(
  strings.cinemaHeading,
  strings.cinemaIntro,
  selectField(view, 'cinema_role', strings.role, strings.noRole, roles, strings.roleHint) +
    selectField(
      view,
      'cinema_channel',
      strings.fallbackChannel,
      strings.noChannel,
      channels,
      strings.fallbackChannelHint,
    ),
)}
${section(strings.iconsHeading, strings.iconsIntro, `<div class="icons">${iconFields}</div>`)}
${section(
  strings.generalHeading,
  null,
  fieldShell(view, 'timezone', strings.timezone, timezoneControl, strings.timezoneHint) +
    selectField(
      view,
      'config_role',
      strings.adminRole,
      strings.noRole,
      roles,
      strings.adminRoleHint,
    ),
)}
${section(
  strings.steamHeading,
  null,
  selectField(
    view,
    'steam_channel',
    strings.steamChannel,
    strings.noChannel,
    channels,
    strings.steamChannelHint,
  ),
)}
<div class="actions"><button type="submit">${escapeHtml(strings.save)}</button></div>
</form>
${section(strings.watchesHeading, null, watchList(view))}`,
  });
};

export interface MessagePageView {
  readonly locale: AppLocale;
  readonly strings: ConsoleStrings;
  readonly title: string;
  readonly message: string;
}

/** A dead end: not found, or a request refused for coming from elsewhere. */
export const messagePage = (view: MessagePageView): string =>
  layout({
    locale: view.locale,
    strings: view.strings,
    title: view.title,
    narrow: true,
    body: `<h1>${escapeHtml(view.title)}</h1><p class="lead">${escapeHtml(view.message)}</p><p><a href="${ADMIN_BASE_PATH}/">← ${escapeHtml(view.strings.allServers)}</a></p>`,
  });
