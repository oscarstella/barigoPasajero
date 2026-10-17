const { chromium } = require("@playwright/test");
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const images = [];
  page.on("response", async (r) => {
    if (r.url().includes("tile.openstreetmap.org")) {
      images.push({
        url: r.url(),
        status: r.status(),
        bytes: (await r.body().catch(() => Buffer.alloc(0))).length,
      });
    }
  });
  await page.goto("http://localhost:8081", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.screenshot({
    path: "artifacts/barigo-home-390.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      title: await page.title(),
      text: (await page.locator("body").innerText()).slice(0, 1800),
      errors,
      images,
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
