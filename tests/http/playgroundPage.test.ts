import { describe, expect, it } from 'vitest';
import { playgroundPage } from '../../src/http/playgroundPage.ts';
import { CATALOG } from '../../src/valorant/catalog.ts';

const html = (): string => playgroundPage({ used: 2, limit: 30 });

const scriptsIn = (page: string): string[] =>
  [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '');

describe('playgroundPage', () => {
  it('renders a complete document', () => {
    const page = html();

    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('</html>');
    expect(page).toContain('<title>Valorant API playground</title>');
  });

  // A syntax error here would only ever surface in someone's browser console.
  it('emits inline scripts that parse', () => {
    const scripts = scriptsIn(html());

    expect(scripts).toHaveLength(2);
    for (const source of scripts) {
      expect(() => new Function(source)).not.toThrow();
    }
  });

  it('embeds every catalog endpoint as data for the form', () => {
    const [data] = scriptsIn(html());
    const parsed = JSON.parse(
      (data ?? '').replace('window.__ENDPOINTS__ = ', '').replace(/;$/, ''),
    ) as { id: string; params: unknown[] }[];

    expect(parsed).toHaveLength(CATALOG.length);
    expect(parsed.map((entry) => entry.id)).toEqual(CATALOG.map((entry) => entry.id));
  });

  it('groups the endpoint picker', () => {
    const page = html();

    expect(page).toContain('<optgroup label="Account">');
    expect(page).toContain('<optgroup label="Esports">');
  });

  it('shows the shared rate-limit usage', () => {
    expect(html()).toContain('2/30');
  });

  it('asks robots to stay away', () => {
    expect(html()).toContain('name="robots" content="noindex, nofollow"');
  });

  it('references no external asset', () => {
    const page = html();

    expect(page).not.toMatch(/(src|href)="(https?:)?\/\//);
  });

  // A literal `</script>` anywhere in the payload would end the block early and
  // spill the rest of the JSON into the document as text.
  it('never closes the script block from inside the embedded data', () => {
    const [data] = scriptsIn(html());

    expect(data).not.toContain('</script>');
    expect(html().match(/<script>/g)).toHaveLength(2);
  });
});
