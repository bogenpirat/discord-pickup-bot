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

  /*
   * The page used to fetch a bare relative 'call?…'. A relative reference
   * resolves against the directory of the current path, so from
   * /pickup/<secret>/valorant-playground it reached /pickup/<secret>/call and
   * 404'd — every request from the page failed. It now builds the path itself.
   */
  describe('the call url it builds', () => {
    const callUrlAt = (pathname: string): string => {
      const [, script] = scriptsIn(html());
      const source = /const callUrl = (\(\) => [^;]+);/.exec(script ?? '')?.[1];
      expect(source, 'callUrl not found in the page script').toBeDefined();
      // eslint-disable-next-line no-new-func -- evaluating the page's own snippet is the point
      return new Function('location', `return (${source})();`)({ pathname }) as string;
    };

    it.each([
      ['/pickup/s3cret/valorant-playground', '/pickup/s3cret/valorant-playground/call'],
      ['/pickup/s3cret/valorant-playground/', '/pickup/s3cret/valorant-playground/call'],
      [
        '/proxied/pickup/s3cret/valorant-playground',
        '/proxied/pickup/s3cret/valorant-playground/call',
      ],
    ])('resolves %o to %o', (pathname, expected) => {
      expect(callUrlAt(pathname)).toBe(expected);
    });

    it('does not rely on relative resolution, which would drop the last segment', () => {
      const pathname = '/pickup/s3cret/valorant-playground';
      const relative = new URL('call', `http://host${pathname}`).pathname;

      expect(relative).toBe('/pickup/s3cret/call');
      expect(callUrlAt(pathname)).not.toBe(relative);
    });
  });

  // A literal `</script>` anywhere in the payload would end the block early and
  // spill the rest of the JSON into the document as text.
  it('never closes the script block from inside the embedded data', () => {
    const [data] = scriptsIn(html());

    expect(data).not.toContain('</script>');
    expect(html().match(/<script>/g)).toHaveLength(2);
  });
});
