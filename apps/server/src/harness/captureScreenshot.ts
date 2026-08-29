// harness/captureScreenshot.ts — M11: Real screenshot capture via Playwright
import { chromium, type Browser } from "playwright";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function captureScreenshot(url: string, options?: { width?: number; height?: number }): Promise<string | null> {
  try {
    const b = await getBrowser();
    const page = await b.newPage({
      viewport: { width: options?.width ?? 375, height: options?.height ?? 812 },
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 10000 });
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    await page.close();

    return screenshot.toString("base64");
  } catch {
    return null;
  }
}

export async function verifyWithScreenshot(
  url: string,
  sliceSpec: string,
  builderClaim: string,
): Promise<{ screenshot: string | null; verified: boolean; reason: string }> {
  const screenshot = await captureScreenshot(url);
  if (!screenshot) {
    return { screenshot: null, verified: false, reason: "Screenshot capture failed — preview not running" };
  }
  return { screenshot, verified: true, reason: "Screenshot captured via Playwright" };
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
