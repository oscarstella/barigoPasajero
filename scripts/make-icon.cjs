const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="240" fill="#143E35"/><path d="M210 656L422 316L544 489L649 351L814 656" fill="none" stroke="#D8F36A" stroke-width="49" stroke-linejoin="round" stroke-linecap="round"/><path d="M422 316L375 475L422 447L467 475Z" fill="#F5F4EE"/><path d="M484 748L609 561L690 748Z" fill="#D8F36A"/><circle cx="281" cy="285" r="29" fill="#D8F36A"/></svg>';
(async () => {
  fs.writeFileSync("assets/barigo-mark.svg", svg);
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  await page.setContent("<style>body{margin:0}</style>" + svg);
  await page.screenshot({
    path: "assets/barigo-icon.png",
    omitBackground: true,
  });
  await browser.close();
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  app.expo.icon = "./assets/barigo-icon.png";
  app.expo.android.adaptiveIcon = {
    foregroundImage: "./assets/barigo-icon.png",
    backgroundColor: "#143E35",
  };
  app.expo.web.favicon = "./assets/barigo-icon.png";
  fs.writeFileSync("app.json", JSON.stringify(app, null, 2) + "\n");
})();
