import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from "@playwright/test";

/**
 * Promo material: a captioned walkthrough video, high-resolution stills and a social card.
 *
 *   pnpm promo                 # demo mode: heuristic suggestions, identical on every run
 *   PROMO_LIVE=1 pnpm promo    # real model from .env (OPENROUTER_API_KEY, OPENROUTER_MODEL)
 *   pnpm promo:encode          # recording → docs/promo/demo.mp4 and demo.gif (needs ffmpeg)
 *
 * Skipped in the regular e2e run.
 */
test.skip(!process.env.PROMO, "Set PROMO=1 to record promo material.");
test.describe.configure({ mode: "serial" });

const OUT = "docs/promo";
const VIDEO_DIR = "test-results/promo-video";
const VIDEO_SIZE = { width: 1280, height: 800 };
const LIVE = Boolean(process.env.PROMO_LIVE);
/** A live model needs a few seconds per answer; demo mode answers at once. */
const SUGGESTIONS_TIMEOUT = 90_000;

const TAGLINE = "AI suggests the column mapping. You approve it. Deterministic code does the rest.";
const STACK = ["Next.js 16", "React 19", "LangGraph", "OpenRouter", "TanStack Table", "Zod"];

/* ------------------------------------------------------------------------------------------------
 * Overlay: fake cursor, click ripple, step captions and full-screen title cards.
 * Runs in the page, so it is self-contained and styled with the app's own tokens.
 * --------------------------------------------------------------------------------------------- */

interface PromoOverlay {
  caption: (step: number, title: string, detail: string) => void;
  hideCaption: () => void;
  card: (html: string) => void;
  hideCard: () => void;
}

declare global {
  interface Window {
    __promo: PromoOverlay;
  }
}

function installOverlay() {
  const css = `
    #promo-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;
      font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif; }
    #promo-overlay .cursor { position: absolute; left: 0; top: 0; width: 24px; height: 24px;
      transform: translate(-100px, -100px); filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }
    #promo-overlay .ripple { position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px;
      border-radius: 9999px; background: var(--primary); opacity: 0.35;
      animation: promo-ripple 520ms ease-out forwards; }
    @keyframes promo-ripple { from { transform: scale(0.2); opacity: 0.45; }
      to { transform: scale(1.6); opacity: 0; } }
    #promo-overlay.no-cursor .cursor { display: none; }
    #promo-overlay .caption { position: absolute; right: 24px; top: 96px; width: 430px;
      display: flex; gap: 14px; align-items: flex-start; padding: 14px 18px 15px 14px;
      border-radius: 13px; background: oklch(0.216 0.006 56.043 / 0.95); color: white;
      box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.35); opacity: 0; transform: translateY(8px);
      transition: opacity 260ms ease, transform 260ms ease; }
    #promo-overlay .caption.on { opacity: 1; transform: none; }
    #promo-overlay .caption .step { flex: none; display: grid; place-items: center; width: 28px;
      height: 28px; border-radius: 9999px; background: var(--primary); font-weight: 600;
      font-size: 14px; color: var(--primary-foreground); }
    #promo-overlay .caption .title { font-size: 16px; font-weight: 600; line-height: 1.35; }
    #promo-overlay .caption .detail { margin-top: 3px; font-size: 13.5px; line-height: 1.45;
      color: rgb(255 255 255 / 0.74); }
    #promo-overlay .card { position: absolute; inset: 0; display: grid; place-items: center;
      background: radial-gradient(1200px 600px at 50% 0%, var(--primary-soft), var(--background) 70%);
      color: var(--foreground); opacity: 0; transition: opacity 420ms ease; }
    #promo-overlay .card.on { opacity: 1; }
    #promo-overlay .card.on ~ .cursor { opacity: 0; }
  `;
  const cursorSvg = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 3-1.3-2.9-6.5h6.4z" fill="#1c1917" stroke="white"
      stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  let x = -100;
  let y = -100;

  function root(): HTMLElement | null {
    let el = document.getElementById("promo-overlay");
    if (!el && document.body) {
      el = document.createElement("div");
      el.id = "promo-overlay";
      el.innerHTML = `<style>${css}</style><div class="card"></div>
        <div class="caption"></div><div class="cursor">${cursorSvg}</div>`;
      document.body.appendChild(el);
      place();
    }
    return el;
  }
  const part = (name: string) => root()?.querySelector<HTMLElement>(`.${name}`) ?? null;
  function place() {
    const cursor = document.querySelector<HTMLElement>("#promo-overlay .cursor");
    if (cursor) cursor.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
  }

  window.addEventListener(
    "mousemove",
    (event) => {
      x = event.clientX;
      y = event.clientY;
      root();
      place();
    },
    true,
  );
  window.addEventListener(
    "mousedown",
    (event) => {
      const host = root();
      if (!host) return;
      const ripple = document.createElement("div");
      ripple.className = "ripple";
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      host.insertBefore(ripple, part("cursor"));
      setTimeout(() => ripple.remove(), 600);
    },
    true,
  );
  document.addEventListener("DOMContentLoaded", () => root());

  window.__promo = {
    caption(step, title, detail) {
      const el = part("caption");
      if (!el) return;
      // Under the sticky header, where no step keeps anything the walkthrough clicks.
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 84;
      el.style.top = `${header + 12}px`;
      el.classList.remove("on");
      setTimeout(
        () => {
          el.innerHTML = `<div class="step">${step}</div><div><div class="title">${title}</div>
            <div class="detail">${detail}</div></div>`;
          el.classList.add("on");
        },
        el.innerHTML ? 260 : 0,
      );
    },
    hideCaption() {
      part("caption")?.classList.remove("on");
    },
    card(html) {
      const el = part("card");
      if (!el) return;
      el.innerHTML = html;
      el.classList.add("on");
    },
    hideCard() {
      part("card")?.classList.remove("on");
    },
  };
}

/** Title card markup, shared by the video's intro/outro and the social preview. */
function titleCard({ eyebrow, footer }: { eyebrow: string; footer: string }) {
  const chips = STACK.map(
    (s) =>
      `<span style="padding:5px 11px;border:1px solid var(--border);border-radius:9999px;
        background:var(--card);font-size:14px;color:var(--muted-foreground)">${s}</span>`,
  ).join("");
  return `<div style="max-width:880px;padding:0 48px;text-align:center">
    <div style="font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
      color:var(--primary)">${eyebrow}</div>
    <div style="margin-top:14px;font-size:64px;font-weight:650;letter-spacing:-.025em;
      line-height:1.05">Data Onboarding</div>
    <div style="margin:20px auto 0;max-width:640px;font-size:22px;line-height:1.45;
      color:var(--muted-foreground)">${TAGLINE}</div>
    <div style="margin-top:30px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">${chips}</div>
    <div style="margin-top:34px;font-size:15px;color:var(--muted-foreground)">${footer}</div>
  </div>`;
}

/* ------------------------------------------------------------------------------------------------
 * Direction: smooth cursor moves and pacing, so the recording reads like a person using it.
 * --------------------------------------------------------------------------------------------- */

class Director {
  private x: number;
  private y: number;

  constructor(
    readonly page: Page,
    viewport: { width: number; height: number },
  ) {
    this.x = viewport.width / 2;
    this.y = viewport.height / 2;
  }

  hold(ms: number) {
    return this.page.waitForTimeout(ms);
  }

  /** Scroll with the wheel, a little at a time, until the target sits between header and footer. */
  async reveal(target: Locator) {
    // Footer and header buttons never move with the page; scrolling toward them only jumps it.
    const pinned = await target.evaluate((el) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const { position } = getComputedStyle(node);
        if (position === "fixed" || position === "sticky") return true;
      }
      return false;
    });
    if (pinned) return;
    const { height } = this.page.viewportSize()!;
    for (let i = 0; i < 80; i += 1) {
      const box = await target.boundingBox();
      if (!box) break;
      const center = box.y + box.height / 2;
      const [top, bottom] = [150, height - 140];
      if (center >= top && center <= bottom) return;
      const distance = center > bottom ? center - bottom + 40 : center - top - 40;
      await this.page.mouse.wheel(0, Math.sign(distance) * Math.min(48, Math.abs(distance)));
      await this.page.waitForTimeout(16);
    }
    await target.scrollIntoViewIfNeeded();
  }

  async moveTo(target: Locator, duration = 650) {
    await this.reveal(target);
    const box = await target.boundingBox();
    if (!box) throw new Error("Target is not visible");
    await this.glide(box.x + box.width / 2, box.y + box.height / 2, duration);
  }

  /** Ease-in-out cursor move, paced by the clock rather than a step count. */
  async glide(toX: number, toY: number, duration = 650) {
    const fromX = this.x;
    const fromY = this.y;
    const start = Date.now();
    for (let t = 0; t < 1;) {
      t = Math.min(1, (Date.now() - start) / duration);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      await this.page.mouse.move(fromX + (toX - fromX) * ease, fromY + (toY - fromY) * ease);
      await this.page.waitForTimeout(8);
    }
    this.x = toX;
    this.y = toY;
  }

  async click(target: Locator) {
    await this.moveTo(target);
    await this.hold(180);
    await target.click();
  }

  async caption(step: number, title: string, detail: string) {
    await this.page.evaluate(
      ([s, t, d]) => window.__promo.caption(Number(s), t!, d!),
      [String(step), title, detail],
    );
    await this.hold(300);
  }

  async card(html: string) {
    await this.page.evaluate((h) => window.__promo.card(h), html);
    await this.hold(450);
  }

  async hideCard() {
    await this.page.evaluate(() => window.__promo.hideCard());
    await this.hold(450);
  }
}

async function newPromoContext(browser: Browser, options: BrowserContextOptions) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    acceptDownloads: true,
    // Unlike the e2e run, keep the app's own transitions: they are part of how it feels.
    reducedMotion: "no-preference",
    ...options,
  });
  await context.addInitScript(installOverlay);
  return context;
}

async function waitForSuggestions(page: Page) {
  await expect(page.getByText(/^Analysing \d+ columns/)).toBeHidden({
    timeout: SUGGESTIONS_TIMEOUT,
  });
  // A live recording that silently fell back to heuristics would misrepresent the product.
  if (LIVE) await expect(page.getByText(/suggestions come from heuristics/)).toHaveCount(0);
}

const brokenEmail = (page: Page) =>
  page.getByRole("button", { name: /^Email, row 6: sales\(at\)northwind-packaging\.co\.uk/ });

/* ------------------------------------------------------------------------------------------------
 * The video
 * --------------------------------------------------------------------------------------------- */

test("walkthrough video", async ({ browser }) => {
  test.setTimeout(240_000);
  await mkdir(VIDEO_DIR, { recursive: true });
  const context = await newPromoContext(browser, {
    viewport: VIDEO_SIZE,
    recordVideo: { dir: VIDEO_DIR, size: VIDEO_SIZE },
  });
  const recordingStarted = Date.now();
  const page = await context.newPage();
  const d = new Director(page, VIDEO_SIZE);

  // Intro
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Import customer data" })).toBeVisible();
  await d.card(
    titleCard({ eyebrow: "Customer data import", footer: "Import → Map → Validate → Export" }),
  );
  const introShownAt = (Date.now() - recordingStarted) / 1000;
  await d.hold(2800);
  await d.hideCard();

  // 1. Import
  await d.caption(
    1,
    "Drop in a messy CSV or Excel file",
    "Parsed in the browser: delimiters, encodings, duplicate headers and blank rows handled.",
  );
  await d.hold(900);
  await d.click(page.getByRole("button", { name: "Try with sample data" }));
  await expect(page.getByText(/184 rows · 14 columns/).first()).toBeVisible();
  await d.moveTo(page.getByText("Adjusted while reading the file"), 800);
  await d.hold(2200);

  // 2. Map
  await d.click(page.getByRole("link", { name: "Continue to mapping" }));
  await d.caption(
    2,
    LIVE ? "An LLM suggests the column mapping" : "Each column gets a suggested target field",
    "It sees column profiles, not raw values. Every suggestion comes with a confidence and a reason.",
  );
  await waitForSuggestions(page);
  await d.moveTo(page.getByText(/^(Suggested by|Demo mode:)/), 700);
  await d.hold(1800);
  await d.click(page.getByRole("button", { name: "Show details for Country" }));
  await d.hold(2800);

  await d.caption(
    3,
    "You stay in charge",
    "Accept, change or ignore any column. Nothing is applied until you approve.",
  );
  await d.click(page.getByRole("combobox", { name: "Target field for Segment" }));
  await d.hold(500);
  await d.click(page.getByRole("option", { name: "Don’t import" }));
  await d.hold(1400);
  await d.click(page.getByRole("button", { name: "Approve mapping" }));

  // 3. Validate
  await expect(page.getByRole("heading", { name: "Review and fix values" })).toBeVisible();
  await d.caption(
    4,
    "Deterministic validation, row by row",
    "Errors, warnings and duplicates are found by plain code, so the same file always gives the same result.",
  );
  const kpis = page.getByRole("group", { name: "Filter rows by status" });
  await d.moveTo(kpis, 800);
  await d.hold(1600);
  await d.click(page.getByRole("button", { name: /Apply \d+ suggested fixes/ }));
  await d.hold(1600);
  await d.click(kpis.getByRole("button", { name: /^Errors/ }));
  await d.hold(1400);

  await d.caption(
    5,
    "Fix what is left, right in the grid",
    "Click a flagged cell to see why it failed and correct it. Every edit is tracked.",
  );
  await d.click(brokenEmail(page));
  await expect(page.getByText("is not a valid email address.")).toBeVisible();
  await d.hold(1300);
  const input = page.getByLabel("Edit value");
  await input.press("ControlOrMeta+a");
  await input.pressSequentially("sales@northwind-packaging.co.uk", { delay: 45 });
  await d.hold(500);
  await input.press("Enter");
  await d.hold(1600);

  // 4. Export
  await d.click(page.getByRole("link", { name: "Continue to export" }));
  await expect(page.getByRole("heading", { name: "Export clean data" })).toBeVisible();
  await d.caption(
    6,
    "Export a clean, formula-safe CSV",
    "Plus a JSON report of every mapping decision, fix and excluded row.",
  );
  await d.moveTo(page.getByText("Rows to export"), 800);
  await d.hold(1800);
  const download = page.waitForEvent("download");
  // The footer button: always in view, so the page does not jump before the click.
  await d.click(page.getByRole("button", { name: "Download CSV" }).last());
  await download;
  await d.hold(2400);

  // Outro
  await page.evaluate(() => window.__promo.hideCaption());
  await d.card(
    titleCard({ eyebrow: "Customer data import", footer: "Runs on Vercel, no database needed" }),
  );
  await d.hold(3200);

  const video = page.video();
  await context.close();
  await video?.saveAs(`${VIDEO_DIR}/demo.webm`);
  await writeFile(
    `${VIDEO_DIR}/meta.json`,
    // Frames before the intro card are a blank page loading; the encoder trims them.
    JSON.stringify({ trimStart: Math.max(0, introShownAt - 0.2), live: LIVE }, null, 2),
  );
});

/* ------------------------------------------------------------------------------------------------
 * Stills and the social card
 * --------------------------------------------------------------------------------------------- */

async function still(page: Page, name: string) {
  // Toasts are transient and the fake cursor is for the video; keep both out of the stills.
  await page.addStyleTag({
    content: "[data-sonner-toaster],#promo-overlay .cursor{display:none!important}",
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const STILL_VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, viewport } of STILL_VIEWPORTS) {
  test(`stills (${name})`, async ({ browser }) => {
    test.setTimeout(180_000);
    await mkdir(OUT, { recursive: true });
    const context = await newPromoContext(browser, {
      viewport,
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.getByRole("button", { name: "Try with sample data" }).click();
    await expect(page.getByText(/184 rows · 14 columns/).first()).toBeVisible();
    await still(page, `import-${name}`);

    await page.getByRole("link", { name: "Continue to mapping" }).click();
    await waitForSuggestions(page);
    // Desktop shows one suggestion's reasoning; the phone keeps to the top of the list.
    if (name === "desktop")
      await page.getByRole("button", { name: "Show details for E-mail", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await still(page, `mapping-${name}`);

    await page.getByRole("button", { name: "Approve mapping" }).click();
    await expect(page.getByRole("heading", { name: "Review and fix values" })).toBeVisible();
    await page.getByRole("button", { name: /Apply \d+ suggested fixes/ }).click();
    await still(page, `validation-${name}`);

    await brokenEmail(page).click();
    await expect(page.getByLabel("Edit value")).toBeVisible();
    await still(page, `validation-edit-${name}`);
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "Continue to export" }).click();
    await expect(page.getByRole("heading", { name: "Export clean data" })).toBeVisible();
    await still(page, `export-${name}`);

    await context.close();
  });
}

test("social preview", async ({ browser }) => {
  // GitHub's recommended size; built from the desktop mapping still captured above.
  const shot = await readFile(`${OUT}/mapping-desktop.png`);
  const context = await newPromoContext(browser, {
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Import customer data" })).toBeVisible();

  const chips = STACK.slice(0, 4)
    .map(
      (s) =>
        `<span style="padding:4px 10px;border:1px solid var(--border);border-radius:9999px;
          background:var(--card);font-size:14px;color:var(--muted-foreground)">${s}</span>`,
    )
    .join("");
  const html = `<div style="position:absolute;inset:0;display:grid;grid-template-columns:470px 1fr;
      align-items:center;text-align:left">
    <div style="padding:0 20px 0 64px">
      <div style="font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
        color:var(--primary)">Customer data import</div>
      <div style="margin-top:12px;font-size:50px;font-weight:650;letter-spacing:-.025em;
        line-height:1.05">Data Onboarding</div>
      <div style="margin-top:18px;font-size:20px;line-height:1.45;color:var(--muted-foreground)">
        ${TAGLINE}</div>
      <div style="margin-top:26px;display:flex;flex-wrap:wrap;gap:8px">${chips}</div>
    </div>
    <div style="position:relative;height:100%">
      <img src="data:image/png;base64,${shot.toString("base64")}" alt=""
        style="position:absolute;left:24px;top:72px;width:1000px;border-radius:14px;
        border:1px solid var(--border);box-shadow:0 30px 60px -20px rgb(28 25 23 / 0.35)">
    </div>
  </div>`;
  await page.evaluate((h) => window.__promo.card(h), html);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/social-preview.png` });
  await context.close();
});
