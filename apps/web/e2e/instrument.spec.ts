import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

for (const viewport of [
  { width: 735, height: 800 },
  { width: 1280, height: 900 },
]) {
  for (const theme of ['dark', 'light'] as const) {
    test(`instrument at ${viewport.width}px, ${theme}: fixed height, bundled fonts, keyboard sheet`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await pinClock(page);
      await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
        theme === 'dark',
      );
      await page.getByTestId('file-input').setInputFiles(fixturePaths());
      await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
      // The document never scrolls - and, because the instrument clips its own overflow, that
      // alone would not notice a region rendering wider than the frame. `wide` therefore names
      // every element inside the instrument whose right edge lies past the frame's: a clipped
      // toolbar, a row whose tags fall off the end, a top bar whose START OVER never appears.
      const noScroll = async () =>
        page.evaluate(() => {
          const root = document.querySelector<HTMLElement>('[data-region="top"]')
            ?.parentElement as HTMLElement;
          const edge = root.getBoundingClientRect().right;
          const wide = Array.from(root.querySelectorAll<HTMLElement>('*'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.right > edge + 0.5;
            })
            .map((el) => `${el.tagName}.${el.className.toString().slice(0, 40)}`);
          return {
            h: document.documentElement.scrollHeight === document.documentElement.clientHeight,
            w: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            wide: wide.slice(0, 4),
          };
        });
      for (const step of ['upload', 'facts', 'review', 'gaps', 'export'] as const) {
        await page.getByTestId(`step-${step}`).click();
        expect(await noScroll(), step).toEqual({ h: true, w: true, wide: [] });
      }
      await page.getByTestId('step-review').click();
      await page.getByTestId('filter-all').click();
      // The instrument itself never scrolls (proved above by `noScroll`); only the list region
      // does. The Musterwerk proposals (36 groups) overflow the review list's own viewport, so
      // this proves the region is genuinely scrollable, not merely tall enough by accident.
      const list = page.locator('[data-region="list"]');
      const scrollable = await list.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(scrollable).toBe(true);
      const scrollTop = await list.evaluate((el) => {
        el.scrollTop = 200;
        return el.scrollTop;
      });
      expect(scrollTop).toBeGreaterThan(0);
      await page.getByTestId('group').first().click();
      // The app's default language is German ("shell.of": "{n} von {total}"), so the position
      // counter reads "1 von N", not "1 of N" (i18n/de.ts, i18n/en.ts) - match either locale's
      // rendering rather than assume English, since nothing in this test switches language.
      await expect(page.getByTestId('review-sheet')).toContainText(/1\s+(of|von)\s+\d+/);
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('review-sheet')).toContainText(/2\s+(of|von)\s+\d+/);
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByTestId('review-sheet')).toContainText(/1\s+(of|von)\s+\d+/);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('review-sheet')).toHaveCount(0);
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          mono: document.fonts.check('11px "Space Mono"'),
          sans: document.fonts.check('14px "Space Grotesk"'),
          doto: document.fonts.check('40px "Doto"'),
        };
      });
      expect(fonts).toEqual({ mono: true, sans: true, doto: true });
      const foreignFonts = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((n) => /\.(woff2?|ttf|otf)(\?|$)/.test(n) && !n.startsWith(location.origin)),
      );
      expect(foreignFonts).toEqual([]);
    });
  }
}
