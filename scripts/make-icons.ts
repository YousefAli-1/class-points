// One-off: renders public/icons/icon.svg to the PNG icons with Playwright's Chromium.
// Run `npm run icons` after changing the SVG, then commit the PNGs. Without Playwright's own browser
// installed, use one that is: `npm run icons -- --channel=chrome` (or msedge).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ICONS_DIR = join(import.meta.dirname, "..", "public", "icons");
const FOREST = "#14532D";

/** `fill` paints the corners: iOS shows a transparent apple-touch-icon corner as black. */
const OUTPUTS: { file: string; size: number; fill?: string }[] = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180, fill: FOREST },
];

const channel = process.argv.find((a) => a.startsWith("--channel="))?.slice("--channel=".length);
const svg = await readFile(join(ICONS_DIR, "icon.svg"), "utf8");
const browser = await chromium.launch({ channel });
try {
  for (const { file, size, fill } of OUTPUTS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sized = svg.replace('width="512" height="512"', `width="${size}" height="${size}"`);
    await page.setContent(
      `<html><body style="margin:0;background:${fill ?? "transparent"}">${sized}</body></html>`,
    );
    await page.locator("svg").screenshot({ path: join(ICONS_DIR, file), omitBackground: !fill });
    await page.close();
    console.log(`Wrote public/icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
