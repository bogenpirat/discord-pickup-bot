import { CATALOG, type CatalogEntry } from '../valorant/catalog.ts';

/**
 * Escapes text for HTML *and* for a `<script>` string literal. `</` is broken up
 * because a browser ends a script block at the first literal `</script>`,
 * wherever it appears — including inside a JSON string.
 */
const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const escapeJson = (value: unknown): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028');

const STYLE = `
:root { color-scheme: dark; --bg:#14151a; --panel:#1c1e26; --line:#2c2f3a;
        --text:#e6e7ea; --muted:#9aa0ad; --accent:#ff4655; --ok:#4ade80; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text);
       font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif; }
header { padding:16px 20px; border-bottom:1px solid var(--line); display:flex;
         align-items:baseline; gap:12px; flex-wrap:wrap; }
h1 { font-size:16px; margin:0; }
header .note { color:var(--muted); font-size:12px; }
main { display:grid; grid-template-columns:minmax(280px,340px) 1fr; gap:1px;
       background:var(--line); min-height:calc(100vh - 57px); }
section { background:var(--bg); padding:20px; min-width:0; }
label { display:block; font-size:12px; color:var(--muted); margin:12px 0 4px; }
label .req { color:var(--accent); }
select, input, button { width:100%; padding:8px 10px; border-radius:6px;
                        border:1px solid var(--line); background:var(--panel);
                        color:var(--text); font:inherit; }
button { margin-top:20px; background:var(--accent); border-color:var(--accent);
         color:#fff; font-weight:600; cursor:pointer; }
button:disabled { opacity:.5; cursor:progress; }
.path { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
        color:var(--muted); margin-top:10px; word-break:break-all; }
.meta { display:flex; gap:16px; flex-wrap:wrap; font-size:12px; color:var(--muted);
        margin-bottom:12px; }
.meta b { color:var(--text); font-weight:600; }
.ok { color:var(--ok); }
.bad { color:var(--accent); }
pre { margin:0; padding:14px; background:var(--panel); border:1px solid var(--line);
      border-radius:6px; overflow:auto; max-height:calc(100vh - 190px);
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
      white-space:pre-wrap; word-break:break-word; }
img.result { max-width:100%; background:var(--panel); border:1px solid var(--line);
             border-radius:6px; padding:14px; }
@media (max-width: 800px) { main { grid-template-columns:1fr; } }
`;

const SCRIPT = `
const endpoints = window.__ENDPOINTS__;
const form = document.getElementById('params');
const picker = document.getElementById('endpoint');
const path = document.getElementById('path');
const out = document.getElementById('out');
const meta = document.getElementById('meta');
const run = document.getElementById('run');

const byId = (id) => endpoints.find((entry) => entry.id === id);

const field = (param) => {
  const wrap = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = param.name;
  label.htmlFor = 'p_' + param.name;
  if (param.required) {
    const star = document.createElement('span');
    star.className = 'req';
    star.textContent = ' *';
    label.append(star);
  }
  wrap.append(label);

  let input;
  if (param.options) {
    input = document.createElement('select');
    for (const value of param.required ? param.options : ['', ...param.options]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === '' ? '—' : value;
      input.append(option);
    }
  } else if (param.type === 'boolean') {
    input = document.createElement('select');
    for (const value of ['', 'true', 'false']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === '' ? '—' : value;
      input.append(option);
    }
  } else {
    input = document.createElement('input');
    input.type = param.type === 'number' ? 'number' : 'text';
    if (param.example) input.placeholder = param.example;
  }
  input.id = 'p_' + param.name;
  input.name = param.name;
  wrap.append(input);
  return wrap;
};

const render = () => {
  const entry = byId(picker.value);
  form.replaceChildren(...entry.params.map(field));
  path.textContent = entry.path;
  try { localStorage.setItem('valo-playground-endpoint', entry.id); } catch {}
};

const show = (className, text) => {
  meta.innerHTML = '';
  out.replaceChildren();
  const pre = document.createElement('pre');
  pre.className = className;
  pre.textContent = text;
  out.append(pre);
};

/*
 * Derived from the page's own location rather than written as a relative 'call?…'.
 * A relative reference resolves against the *directory* of the current path, so
 * from /pickup/<secret>/valorant-playground it would reach /pickup/<secret>/call
 * and 404. This also survives a trailing slash and any prefix a proxy adds.
 *
 * The trailing-slash regex uses [/] rather than \/ because this whole script is a
 * template literal: a backslash escape would be eaten before it ever reached the
 * browser, leaving //+$/ behind and breaking the page.
 */
const callUrl = () => location.pathname.replace(/[/]+$/, '') + '/call';

const call = async () => {
  const entry = byId(picker.value);
  const query = new URLSearchParams({ endpoint: entry.id });
  for (const param of entry.params) {
    const value = document.getElementById('p_' + param.name).value.trim();
    if (value !== '') query.set(param.name, value);
  }

  run.disabled = true;
  show('', 'Running…');
  const started = Date.now();

  try {
    const response = await fetch(callUrl() + '?' + query.toString());
    const payload = await response.json();
    const elapsed = Date.now() - started;

    meta.innerHTML = '';
    const add = (label, value, className) => {
      const span = document.createElement('span');
      const strong = document.createElement('b');
      strong.textContent = value;
      if (className) strong.className = className;
      span.append(label + ' ', strong);
      meta.append(span);
    };
    add('result', payload.ok ? 'ok' : (payload.error?.kind ?? 'error'), payload.ok ? 'ok' : 'bad');
    add('took', elapsed + ' ms');
    if (payload.rateLimit) {
      add('limit', payload.rateLimit.used + '/' + payload.rateLimit.limit);
      add('queued', String(payload.rateLimit.waiting));
    }

    out.replaceChildren();
    if (payload.ok && payload.image) {
      const img = document.createElement('img');
      img.className = 'result';
      img.alt = 'crosshair';
      img.src = 'data:image/png;base64,' + payload.image;
      out.append(img);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(payload.ok ? payload.value : payload.error, null, 2);
      out.append(pre);
    }
  } catch (error) {
    show('bad', String(error));
  } finally {
    run.disabled = false;
  }
};

picker.addEventListener('change', render);
run.addEventListener('click', call);

let remembered = null;
try { remembered = localStorage.getItem('valo-playground-endpoint'); } catch {}
if (remembered && byId(remembered)) picker.value = remembered;
render();
`;

const optionsFor = (entries: readonly CatalogEntry[]): string => {
  const groups = [...new Set(entries.map((entry) => entry.group))];
  return groups
    .map((group) => {
      const options = entries
        .filter((entry) => entry.group === group)
        .map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.id)}</option>`)
        .join('');
      return `<optgroup label="${escapeHtml(group)}">${options}</optgroup>`;
    })
    .join('');
};

/**
 * The whole page in one document: no external assets, so it works on a bot that
 * serves nothing but this and an `.ics` file, and nothing leaks to a CDN.
 */
export const playgroundPage = (rateLimit: { used: number; limit: number }): string => {
  const endpoints = CATALOG.map((entry) => ({
    id: entry.id,
    group: entry.group,
    path: entry.path,
    params: entry.params,
  }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Valorant API playground</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Valorant API playground</h1>
  <span class="note">${endpoints.length} endpoints · shares the bot's rate limit (${rateLimit.used}/${rateLimit.limit} used)</span>
</header>
<main>
  <section>
    <label for="endpoint">endpoint</label>
    <select id="endpoint">${optionsFor(CATALOG)}</select>
    <div class="path" id="path"></div>
    <div id="params"></div>
    <button id="run" type="button">Send request</button>
  </section>
  <section>
    <div class="meta" id="meta"></div>
    <div id="out"><pre>Pick an endpoint and send a request.</pre></div>
  </section>
</main>
<script>window.__ENDPOINTS__ = ${escapeJson(endpoints)};</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
};
