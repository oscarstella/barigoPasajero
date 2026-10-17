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
test("Oscar GPS and Gustavo accept, navigate pickup and finish demo", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: -41.13347,
    longitude: -71.31028,
    accuracy: 15,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Usar mi ubicación GPS" }).click();
  await expect(
    page.getByText("Mi ubicación GPS", { exact: true }),
  ).toBeVisible();
  await page.getByText("Aeropuerto", { exact: true }).click();
  await page.getByRole("button", { name: "Revisar solicitud" }).click();
  await page.getByRole("button", { name: "Confirmar solicitud demo" }).click();
  await expect(
    page.getByText("Buscando en modo demo", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const gustavo = await context.newPage();
  await gustavo.goto("http://localhost:3001/demo/conductor");
  await expect(gustavo.locator("#pass")).not.toBeEmpty();
  if (
    await gustavo
      .locator("#pass")
      .innerText()
      .then((v) => v.includes("Todavía"))
  ) {
    await gustavo.locator("#consent").check();
    await gustavo.locator("#buy").click();
    await expect(gustavo.locator("#pass")).toContainText("paused");
  }
  await gustavo.locator("#activate").click();
  await expect(gustavo.locator("#pass")).toContainText("active");
  await gustavo.locator("#refresh").click();
  await gustavo
    .getByRole("button", { name: "Aceptar solicitud", exact: true })
    .click();
  await expect(
    page.getByText("Gustavo aceptó tu viaje de prueba", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await gustavo
    .getByRole("button", {
      name: "Simular ubicación y calcular ruta hasta Oscar",
    })
    .click();
  await expect(
    gustavo.getByText("Recorrido por calles hasta Oscar", { exact: true }),
  ).toBeVisible();
  await gustavo
    .getByRole("button", { name: "Ir a buscar a Oscar", exact: true })
    .click();
  await gustavo
    .getByRole("button", { name: "Avisar: llegué al punto de partida" })
    .click();
  await gustavo
    .getByRole("button", { name: "Iniciar viaje de prueba" })
    .click();
  await gustavo
    .getByRole("button", { name: "Finalizar viaje de prueba" })
    .click();
  await expect(
    page.getByText("Viaje de prueba finalizado", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await gustavo.locator("#pause").click();
  await expect(gustavo.locator("#pass")).toContainText("paused");
  await page.screenshot({
    path: "artifacts/barigo-oscar-gustavo.png",
    fullPage: true,
  });
});
