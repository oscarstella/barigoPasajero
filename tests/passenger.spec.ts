import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }, testInfo) => {
  if (testInfo.title.includes("home renders")) return;
  const login = await request.post("http://localhost:3001/api/auth/demo", {
    data: { name: "Oscar", role: "passenger" },
  });
  const session = await login.json();
  const headers = { Authorization: "Bearer " + session.token };
  const rows = await request.get("http://localhost:3001/api/trips", {
    headers,
  });
  for (const trip of (await rows.json()).trips || []) {
    if (!["completed", "cancelled"].includes(trip.status))
      await request.post(
        "http://localhost:3001/api/trips/" + trip.id + "/cancel",
        { headers, data: {} },
      );
  }
});
for (const width of [320, 390, 1280])
  test(`home renders map pixels and stays in ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    const tileBodies: Promise<number>[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes("tile.openstreetmap.org") &&
        response.status() === 200
      )
        tileBodies.push(
          response
            .body()
            .then((body) => body.length)
            .catch(() => 0),
        );
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
      page.getByText("Tu próximo destino,", { exact: false }),
    ).toBeVisible();
    const map = page.frameLocator("iframe");
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible({
      timeout: 30000,
    });
    const decoded = await map
      .locator("img.leaflet-tile-loaded")
      .evaluateAll((images) =>
        images.every((i) => (i as HTMLImageElement).naturalWidth > 0),
      );
    expect(decoded).toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/barigo-home-${width}.png`,
      fullPage: true,
    });
    const tileBytes = await Promise.all(tileBodies);
    expect(tileBytes.some((bytes) => bytes > 0)).toBeTruthy();
    console.log(
      `OSM ${width}px: ${tileBytes.length} tiles, ${tileBytes.reduce((sum, bytes) => sum + bytes, 0)} bytes received`,
    );
    await page.getByRole("tab", { name: "Cuenta" }).click();
    await expect(
      page.getByText("Pasajero · cuenta de demostración"),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Actividad" }).click();
    await expect(
      page.getByText("Tus solicitudes de prueba, en un solo lugar."),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `artifacts/barigo-${width}.png`,
      fullPage: true,
    });
  });
test("Oscar requests, restores and cancels demo trip with street route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByText("¿A dónde vamos?", { exact: true }).click();
  await page
    .getByPlaceholder("Calle y número, clínica o comercio")
    .fill("aeropuerto");
  await page
    .getByRole("dialog")
    .getByText(/Aeropuerto (Internacional|de Bariloche)/)
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Revisar solicitud" }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({
    path: "artifacts/barigo-quote-390.png",
    fullPage: true,
  });
  await page.setViewportSize({width:320,height:844});
  await page.getByRole("button", { name: "Revisar solicitud" }).click();
  await expect(
    page.getByText("Revisá tu solicitud", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'artifacts/barigo-confirm-320.png',fullPage:true});
  await page.getByRole("button", { name: "Confirmar solicitud demo" }).click();
  await expect(
    page.getByText("Buscando en modo demo", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    page.getByText("Buscando en modo demo", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByText("Cancelar solicitud", { exact: true }).click();
  await expect(
    page.getByText("¿Cancelamos la solicitud?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(
    page.getByText("Buscando en modo demo", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Actividad" }).click();
  await expect(page.getByText("CANCELADO", { exact: true }).first()).toBeVisible();
});

