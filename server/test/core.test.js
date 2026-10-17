import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, PASS_MS, EXPIRY_MS } from "../src/store.js";
import { createApp } from "../src/app.js";
import { streetRoute } from "../src/routing.js";
import { photonPlace, createGeocoder } from "../src/geocoder.js";
const pickup = { lat: -41.1335, lng: -71.3103, label: "Centro Cívico" },
  destination = { lat: -41.1512, lng: -71.1575, label: "Aeropuerto" };
const route = {
  coordinates: [
    [pickup.lng, pickup.lat],
    [destination.lng, destination.lat],
  ],
  distanceMeters: 14000,
  durationSeconds: 1200,
  steps: [],
  provider: "test fixture",
};
function fixture() {
  let now = 1800000000000;
  return { store: openStore(":memory:", () => now), tick: (ms) => (now += ms) };
}
test("pase: 12 horas acumuladas, pausa sin consumo, vencimiento 24h de compra", () => {
  const { store, tick } = fixture();
  try {
    const { user } = store.demoUser("D", "driver");
    store.purchasePass(user.id, "purchase-1");
    store.changePass(user.id, true);
    tick(2 * 3600000);
    assert.equal(store.currentPass(user.id).remainingMs, 10 * 3600000);
    store.changePass(user.id, false);
    tick(3 * 3600000);
    assert.equal(store.currentPass(user.id).remainingMs, 10 * 3600000);
    store.changePass(user.id, true);
    tick(3600000);
    assert.equal(store.currentPass(user.id).remainingMs, 9 * 3600000);
    store.changePass(user.id, false);
    tick(18 * 3600000);
    assert.equal(store.currentPass(user.id).status, "expired");
    assert.throws(() => store.changePass(user.id, true), /vigente/);
  } finally {
    store.close();
  }
});
test("pase: compra y activación idempotentes, agotamiento, precio histórico congelado", () => {
  const { store, tick } = fixture();
  try {
    const { user } = store.demoUser("D", "driver");
    const p = store.purchasePass(user.id, "purchase-1");
    assert.equal(store.purchasePass(user.id, "purchase-1").id, p.id);
    assert.throws(() => store.purchasePass(user.id, "purchase-2"), /vigente/);
    store.setConfig({ ...store.config(), passAmount: 9000 });
    assert.equal(store.currentPass(user.id).amount, 7500);
    store.changePass(user.id, true);
    store.changePass(user.id, true);
    tick(PASS_MS + 1);
    assert.equal(store.currentPass(user.id).remainingMs, 0);
    assert.equal(store.currentPass(user.id).status, "exhausted");
    assert.equal(
      store.db
        .prepare("SELECT count(*) n FROM pass_ledger WHERE event='activated'")
        .get().n,
      1,
    );
    assert.equal(store.purchasePass(user.id, "purchase-2").amount, 9000);
  } finally {
    store.close();
  }
});
test("viajes: autorización, pase activo obligatorio, estados ordenados y cancelación", () => {
  const { store } = fixture();
  try {
    const p = store.demoUser("P", "passenger").user,
      o = store.demoUser("O", "passenger").user,
      d = store.demoUser("D", "driver").user;
    const trip = store.createTrip(p.id, "request-1", {
      pickup,
      destination,
      estimate: { amount: 5000, currency: "ARS" },
      payment: "cash",
    });
    assert.equal(store.createTrip(p.id, "request-1", {}).id, trip.id);
    assert.throws(() => store.createTrip(p.id, "request-2", {}), /en curso/);
    assert.throws(() => store.getTrip(trip.id, o), /no encontrado/);
    assert.throws(() => store.acceptTrip(trip.id, d), /pase/);
    store.purchasePass(d.id, "purchase-1");
    assert.throws(() => store.acceptTrip(trip.id, d), /pase/);
    store.changePass(d.id, true);
    store.acceptTrip(trip.id, d);
    assert.throws(
      () => store.transitionTrip(trip.id, d, "completed"),
      /inválida/,
    );
    assert.throws(
      () => store.transitionTrip(trip.id, p, "arriving"),
      /conductor/,
    );
    assert.throws(
      () => store.updateDriverLocation(trip.id, p, pickup),
      /conductor/,
    );
    assert.equal(
      store.updateDriverLocation(trip.id, d, pickup).driverLocation.lat,
      pickup.lat,
    );
    for (const status of ["arriving", "arrived", "in_progress", "completed"])
      assert.equal(store.transitionTrip(trip.id, d, status).status, status);
    assert.throws(
      () => store.transitionTrip(trip.id, p, "cancelled"),
      /cancelar/,
    );
    assert.throws(
      () => store.updateDriverLocation(trip.id, d, pickup),
      /terminó/,
    );
    assert.equal(store.getTrip(trip.id, d).estimate.amount, 5000);
  } finally {
    store.close();
  }
});
test("sesión vence y Oscar/Gustavo reutilizan identidades demo persistentes", () => {
  const { store, tick } = fixture();
  try {
    const one = store.demoUser("Oscar", "passenger"),
      two = store.demoUser("Oscar", "passenger");
    assert.equal(one.user.id, two.user.id);
    assert.equal(
      store.demoUser("Gustavo", "driver").user.id,
      "demo-driver-gustavo",
    );
    store.updateName(one.user, "Oscar editado");
    assert.equal(store.authenticate(one.token).name, "Oscar editado");
    assert.equal(store.demoUser("Oscar", "passenger").user.id, one.user.id);
    tick(EXPIRY_MS);
    assert.equal(store.authenticate(one.token), null);
    assert.equal(store.authenticate("wrong"), null);
  } finally {
    store.close();
  }
});
test("routing sin servicio o sin calles falla honestamente", async () => {
  await assert.rejects(
    streetRoute(pickup, destination, {
      fetcher: async () => {
        throw Error("offline");
      },
    }),
    { status: 503 },
  );
  await assert.rejects(
    streetRoute(pickup, destination, {
      fetcher: async () => ({
        ok: true,
        json: async () => ({ code: "NoRoute", routes: [] }),
      }),
    }),
    { status: 422 },
  );
});
test("Photon: altura sólo real, filtro territorial, caché y fallback advertido", async () => {
  const feature = {
    geometry: { coordinates: [-71.3, -41.13] },
    properties: {
      name: "Clínica Test",
      street: "Mitre",
      housenumber: "123",
      city: "Bariloche",
      osm_id: 12,
      osm_type: "N",
    },
  };
  assert.equal(photonPlace(feature).precision, "address");
  assert.equal(photonPlace(feature).detail, "Mitre 123 · Bariloche");
  assert.equal(
    photonPlace({ ...feature, geometry: { coordinates: [0, 0] } }),
    null,
  );
  let calls = 0;
  const geo = createGeocoder({
    clock: () => 100000,
    fetcher: async (url) => {
      calls++;
      assert.equal(url.searchParams.get("lang"), "default");
      return { ok: true, json: async () => ({ features: [feature] }) };
    },
  });
  assert.equal((await geo("Clínica")).places[0].label, "Clínica Test");
  await geo("Clínica");
  assert.equal(calls, 1);
  const failed = createGeocoder({
    clock: () => 100000,
    fetcher: async () => {
      throw Error("offline");
    },
  });
  assert.match((await failed("Clínica")).warning, /sólo lugares/);
});
test("HTTP: consentimiento tarifa, acceso propio, editar perfil y admin sin credenciales default", async () => {
  const { store } = fixture();
  const app = createApp({
    store,
    route: async () => route,
    demoAuth: true,
    adminSecret: "test-secret",
    geocode: async () => ({ places: [] }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (
    path,
    { token, body, method = "GET", headers = {} } = {},
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await call("/api/trips")).status, 401);
    const p = (
        await call("/api/auth/demo", {
          method: "POST",
          body: { name: "Oscar", role: "passenger" },
        })
      ).data,
      d = (
        await call("/api/auth/demo", {
          method: "POST",
          body: { name: "Gustavo", role: "driver" },
        })
      ).data;
    assert.equal(
      (
        await call("/api/me", {
          token: p.token,
          method: "PATCH",
          body: { name: "Oscar S" },
        })
      ).data.user.id,
      p.user.id,
    );
    assert.equal(
      (
        await call("/api/trips", {
          token: p.token,
          method: "POST",
          body: {
            pickup,
            destination,
            requestId: "request-1",
            confirmedEstimate: { currency: "ARS", amount: 1 },
          },
        })
      ).status,
      409,
    );
    const created = await call("/api/trips", {
      token: p.token,
      method: "POST",
      body: {
        pickup,
        destination,
        requestId: "request-1",
        payment: "transfer",
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.trip.payment, "transfer");
    assert.equal(
      (await call(`/api/trips/${created.data.trip.id}`, { token: d.token }))
        .status,
      404,
    );
    const purchase = {
      requestId: "purchase-1",
      acceptDemo: true,
      currency: "ARS",
      amount: 7500,
    };
    assert.equal(
      (
        await call("/api/passes/demo-purchase", {
          token: d.token,
          method: "POST",
          body: { ...purchase, amount: 1 },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/api/passes/demo-purchase", {
          token: d.token,
          method: "POST",
          body: purchase,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call("/api/admin/config", {
          method: "PATCH",
          body: { passAmount: 9000 },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/admin/config", {
          method: "PATCH",
          body: { passAmount: 9000 },
          headers: { "X-Admin-Secret": "test-secret" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/api/passes/demo-purchase", {
          token: d.token,
          method: "POST",
          body: purchase,
        })
      ).data.pass.amount,
      7500,
    );
    assert.equal(
      (
        await call("/api/config", {
          headers: { Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
  } finally {
    app.locals.shutdown();
    await new Promise((r) => server.close(r));
    store.close();
  }
});
test("auth demo desactivada rechaza login", async () => {
  const store = openStore(),
    app = createApp({ store, demoAuth: false }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/auth/demo`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"name":"Oscar"}',
      },
    );
    assert.equal(r.status, 403);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});

import { point } from "../src/errors.js";
test("origen GPS conserva precisión y fecha; rechaza precisión inválida", () => {
  const gps = {
    ...pickup,
    source: "gps",
    accuracyMeters: 14,
    locationTimestamp: "2026-10-17T13:00:00.000Z",
  };
  assert.deepEqual(point(gps, "Origen"), gps);
  assert.throws(
    () => point({ ...gps, accuracyMeters: -1 }, "Origen"),
    /Precisión/,
  );
  assert.throws(
    () => point({ ...gps, locationTimestamp: "bad" }, "Origen"),
    /Fecha/,
  );
});
