import type { WardogsServer } from '../domain/wardogs/parseServerDetail.ts';
import type { AppLocale, Strings } from '../ui/strings.ts';

export type JoinPageOutcome =
  | { readonly kind: 'link'; readonly link: string }
  | { readonly kind: 'failed'; readonly message: string };

export interface JoinPageView {
  readonly locale: AppLocale;
  readonly strings: Strings;
  /** The server's name, or null when neither lookup came back with one. */
  readonly name: string | null;
  /** Live details for the facts line; null when the detail lookup did not answer. */
  readonly server: WardogsServer | null;
  /** The site's rendered status card, shown across the top. */
  readonly cardUrl: string | null;
  readonly serverPageUrl: string;
  readonly outcome: JoinPageOutcome;
}

/** Only the site's card is ever shown, so images are let in from there and nowhere else. */
export const JOIN_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src https://wardogserverlist.com";

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

// Olive from the `/wd` embed colour, lifted so it reads on a dark page.
const STYLE = `
:root { color-scheme: dark; --bg:#0d0e10; --panel:#16181b; --raised:#1d2024; --line:#2a2e33;
        --text:#ebe9e4; --muted:#9c9a93; --accent:#9db267; --accent-ink:#13160c;
        --warn:#e39a74; }
* { box-sizing: border-box; }
html, body { margin:0; }
body { min-height:100vh; min-height:100dvh; display:grid; place-items:center; padding:24px 16px;
       background:radial-gradient(900px 480px at 50% -12%, #262c1a 0%, transparent 70%), var(--bg);
       color:var(--text); font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
.card { width:100%; max-width:520px; background:var(--panel); border:1px solid var(--line);
        border-radius:16px; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,.5); }
.hero { display:block; width:100%; height:auto; aspect-ratio:12/5; object-fit:cover; background:var(--raised);
        border-bottom:1px solid var(--line); }
.content { padding:22px 24px 24px; }
.kicker { margin:0 0 6px; color:var(--accent); font-size:12px; font-weight:650;
          letter-spacing:.14em; text-transform:uppercase; }
h1 { margin:0; font-size:22px; line-height:1.25; overflow-wrap:anywhere; }
.facts { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; padding:0; list-style:none; }
.facts li { padding:3px 11px; border:1px solid var(--line); border-radius:999px; background:var(--raised);
            color:var(--muted); font-size:13px; }
.facts b { color:var(--text); font-weight:600; }
.status { display:flex; align-items:center; gap:10px; margin:22px 0 14px; }
.spinner { flex:none; width:16px; height:16px; border:2px solid var(--line); border-top-color:var(--accent);
           border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation:none; } }
.button { display:block; padding:13px 16px; border-radius:10px; background:var(--accent); color:var(--accent-ink);
          font-weight:700; text-align:center; text-decoration:none; }
.button:hover { filter:brightness(1.08); }
.hint { margin:12px 0 0; color:var(--muted); font-size:13px; text-align:center; }
.notice { margin:22px 0 0; padding:12px 14px; border:1px solid rgba(227,154,116,.35); border-radius:10px;
          background:rgba(227,154,116,.08); color:var(--warn); }
footer { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 24px;
         border-top:1px solid var(--line); color:var(--muted); font-size:13px; }
footer a { color:var(--muted); }
a:hover { color:var(--text); }
.button:hover { color:var(--accent-ink); }
a:focus-visible { outline:2px solid var(--text); outline-offset:3px; }
`;

const factsOf = (server: WardogsServer, strings: Strings): string => {
  const facts = [
    `${escapeHtml(strings.wdPlayersLabel)} <b>${server.players}/${server.maxPlayers}</b>`,
    `${escapeHtml(strings.wdMapLabel)} <b>${escapeHtml(server.map)}</b> (${escapeHtml(server.world)})`,
    ...(server.passworded ? [escapeHtml(strings.wdPassworded)] : []),
  ];
  return `<ul class="facts">${facts.map((fact) => `<li>${fact}</li>`).join('')}</ul>`;
};

const outcomeOf = (outcome: JoinPageOutcome, strings: Strings): string =>
  outcome.kind === 'link'
    ? `<p class="status" role="status"><span class="spinner" aria-hidden="true"></span>${escapeHtml(strings.wdJoinOpening)}</p>
<a class="button" href="${escapeHtml(outcome.link)}">${escapeHtml(strings.wdJoinOpenButton)}</a>
<p class="hint">${escapeHtml(strings.wdJoinBrowserHint)}</p>`
    : `<p class="notice" role="alert">${escapeHtml(outcome.message)}</p>`;

/**
 * The join page. On a link it refreshes straight to Steam as it loads; the
 * button stays behind for a browser that asked first or was told no.
 */
export const joinPage = (view: JoinPageView): string => {
  const { strings, outcome } = view;
  const title = view.name ?? strings.wdJoinKicker;
  const refresh =
    outcome.kind === 'link'
      ? `<meta http-equiv="refresh" content="0; url=${escapeHtml(outcome.link)}">\n`
      : '';
  const hero =
    view.cardUrl === null
      ? ''
      : `<img class="hero" src="${escapeHtml(view.cardUrl)}" alt="" width="1200" height="500">\n`;

  return `<!doctype html>
<html lang="${view.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${refresh}<style>${STYLE}</style>
</head>
<body>
<main class="card">
${hero}<div class="content">
<p class="kicker">${escapeHtml(strings.wdJoinKicker)}</p>
<h1>${escapeHtml(title)}</h1>
${view.server === null ? '' : `${factsOf(view.server, strings)}\n`}${outcomeOf(outcome, strings)}
</div>
<footer><a href="${escapeHtml(view.serverPageUrl)}">${escapeHtml(strings.wdJoinServerPage)}</a><span>${escapeHtml(strings.wdFooter)}</span></footer>
</main>
</body>
</html>
`;
};
