import { fileURLToPath } from "node:url";
import { geocodePlaces } from "./geocoder.js";
import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { openStore } from "./store.js";
import { assert, ApiError, text, point, requestId } from "./errors.js";
import { searchPlaces } from "./places.js";
import { streetRoute, estimateFare } from "./routing.js";
const digest = (value) => createHash("sha256").update(value).digest();
export function createApp({
  store = openStore(),
  route = streetRoute,
  geocode = geocodePlaces,
  demoAuth = process.env.ENABLE_DEMO_AUTH === "true" &&
    process.env.NODE_ENV !== "production",
  adminSecret = process.env.ADMIN_SECRET || "",
  corsOrigins = (
    process.env.CORS_ORIGINS || "http://localhost:8081,http://localhost:19006"
  ).split(","),
} = {}) {
  const app = express(),
    subscribers = new Map(),
    rates = new Map();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    const origin = req.headers.origin;
    if (origin) {
      if (
        !corsOrigins.includes(origin) &&
        origin !== `${req.protocol}://${req.get("host")}`
      )
        return res.status(403).json({ error: "Origen no autorizado" });
      res.set({
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Headers":
          "Content-Type,Authorization,X-Admin-Secret",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      });
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    const now = Date.now(),
      key = req.socket.remoteAddress || "local";
    if (rates.size > 5000)
      for (const [ip, entry] of rates) if (entry.reset < now) rates.delete(ip);
    let rate = rates.get(key);
    if (!rate || rate.reset < now) {
      rate = { count: 0, reset: now + 60000 };
      rates.set(key, rate);
    }
    if (++rate.count > 180) {
      res.set("Retry-After", String(Math.ceil((rate.reset - now) / 1000)));
      return res
        .status(429)
        .json({ error: "Demasiadas solicitudes; esperá un minuto" });
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  const auth = (req, res, next) => {
    if (!demoAuth)
      return res.status(403).json({
        error:
          "El acceso de pruebas está deshabilitado; la autenticación de producción aún no está implementada",
      });
    const token =
      req.headers.authorization?.replace(/^Bearer /, "") ||
      (req.path.endsWith("/events") ? req.query.token : null);
    req.user = store.authenticate(token);
    if (!req.user)
      return res.status(401).json({ error: "Sesión inválida o vencida" });
    next();
  };
  const role = (expected) => (req, res, next) => {
    if (req.user.role !== expected)
      return res.status(403).json({ error: "Rol no autorizado" });
    next();
  };
  const admin = (req, res, next) => {
    const candidate = req.get("X-Admin-Secret") || "";
    if (
      !adminSecret ||
      !timingSafeEqual(digest(candidate), digest(adminSecret))
    )
      return res
        .status(403)
        .json({ error: "Acceso administrativo no autorizado" });
    next();
  };
  const emit = (trip) => {
    for (const res of subscribers.get(trip.id) ?? [])
      res.write(`event: trip\ndata: ${JSON.stringify({ trip })}\n\n`);
  };
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, service: "BariGo API", demoAuth }),
  );
  app.get("/api/config", (req, res) =>
    res.json({
      pricing: store.config(),
      serviceArea: "Bariloche y alrededores",
      pass: { usageHours: 12, validityHours: 24, pausable: true },
      demo: demoAuth,
    }),
  );
  app.patch("/api/admin/config", admin, (req, res) => {
    const current = store.config(),
      body = req.body;
    assert(
      body && typeof body === "object" && !Array.isArray(body),
      400,
      "Configuración inválida",
    );
    assert(
      Object.keys(body).every((k) =>
        [
          "passAmount",
          "passCurrency",
          "baseFare",
          "perKm",
          "perMinute",
        ].includes(k),
      ),
      400,
      "Campo de configuración desconocido",
    );
    for (const key of ["passAmount", "baseFare", "perKm", "perMinute"])
      if (body[key] !== undefined)
        assert(
          Number.isSafeInteger(body[key]) &&
            body[key] >= 1 &&
            body[key] <= 10000000,
          400,
          `${key} inválido`,
        );
    if (body.passCurrency !== undefined)
      assert(
        body.passCurrency === "ARS",
        400,
        "Esta versión inicial usa precio fijo en ARS, sin conversión cambiaria",
      );
    res.json({ pricing: store.setConfig({ ...current, ...body }) });
  });
  app.post("/api/auth/demo", (req, res) => {
    assert(demoAuth, 403, "Acceso demo deshabilitado");
    const name = text(req.body?.name, "Nombre", 80),
      userRole = req.body?.role || "passenger";
    assert(["passenger", "driver"].includes(userRole), 400, "Rol inválido");
    res.status(201).json(store.demoUser(name, userRole));
  });
  app.get("/api/places", async (req, res) =>
    res.json(await geocode(req.query.q)),
  );
  app.get("/demo/conductor", (req, res) => {
    assert(demoAuth, 404, "Ruta no encontrada");
    res.sendFile(
      fileURLToPath(new URL("../../demos/gustavo.html", import.meta.url)),
    );
  });
  app.patch("/api/me", auth, (req, res) =>
    res.json({
      user: store.updateName(req.user, text(req.body?.name, "Nombre", 80)),
    }),
  );
  app.post("/api/estimates", auth, async (req, res) => {
    const pickup = point(req.body?.pickup, "Origen"),
      destination = point(req.body?.destination, "Destino");
    const result = await route(pickup, destination);
    res.json({ route: result, estimate: estimateFare(result, store.config()) });
  });
  app.get("/api/trips", auth, (req, res) =>
    res.json({ trips: store.listTrips(req.user) }),
  );
  app.post("/api/trips", auth, role("passenger"), async (req, res) => {
    const key = requestId(req.body?.requestId),
      previous = store.existingTrip(req.user.id, key);
    if (previous) return res.json({ trip: previous });
    const pickup = point(req.body?.pickup, "Origen"),
      destination = point(req.body?.destination, "Destino"),
      payment = req.body?.payment || "cash";
    assert(
      ["cash", "transfer"].includes(payment),
      400,
      "Medio de pago inválido",
    );
    const result = await route(pickup, destination),
      estimate = estimateFare(result, store.config());
    if (req.body?.confirmedEstimate)
      assert(
        req.body.confirmedEstimate.currency === estimate.currency &&
          req.body.confirmedEstimate.amount === estimate.amount,
        409,
        "La tarifa estimada cambió. Revisá el nuevo valor y confirmá nuevamente",
      );
    const trip = store.createTrip(req.user.id, key, {
      pickup,
      destination,
      route: result,
      estimate,
      payment,
      messages: [
        {
          id: "requested",
          type: "system",
          text: `Solicitud de viaje enviada. Pago: ${payment === "cash" ? "efectivo" : "transferencia"}.`,
          at: new Date().toISOString(),
        },
      ],
    });
    res.status(201).json({ trip });
  });
  app.get("/api/driver/available-trips", auth, role("driver"), (req, res) => {
    const pass = store.currentPass(req.user.id);
    assert(pass?.active, 409, "Activá tu pase para consultar solicitudes");
    res.json({ trips: store.availableTrips() });
  });
  app.get("/api/trips/:id", auth, (req, res) =>
    res.json({ trip: store.getTrip(req.params.id, req.user) }),
  );
  app.get("/api/trips/:id/events", auth, (req, res) => {
    const trip = store.getTrip(req.params.id, req.user);
    res.status(200).set({
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    if (!subscribers.has(trip.id)) subscribers.set(trip.id, new Set());
    subscribers.get(trip.id).add(res);
    res.write(`event: trip\ndata: ${JSON.stringify({ trip })}\n\n`);
    const heartbeat = setInterval(() => {
      if (
        !store.authenticate(
          req.headers.authorization?.replace(/^Bearer /, "") || req.query.token,
        )
      ) {
        res.end();
        return;
      }
      res.write(": heartbeat\n\n");
    }, 20000);
    req.on("close", () => {
      clearInterval(heartbeat);
      subscribers.get(trip.id)?.delete(res);
      if (subscribers.get(trip.id)?.size === 0) subscribers.delete(trip.id);
    });
  });
  app.post("/api/trips/:id/cancel", auth, (req, res) => {
    const trip = store.transitionTrip(req.params.id, req.user, "cancelled");
    emit(trip);
    res.json({ trip });
  });
  app.post("/api/trips/:id/accept", auth, role("driver"), (req, res) => {
    const trip = store.acceptTrip(req.params.id, req.user);
    emit(trip);
    res.json({ trip });
  });
  app.post("/api/trips/:id/status", auth, role("driver"), (req, res) => {
    assert(
      ["arriving", "arrived", "in_progress", "completed"].includes(
        req.body?.status,
      ),
      400,
      "Estado inválido",
    );
    const trip = store.transitionTrip(req.params.id, req.user, req.body.status);
    emit(trip);
    res.json({ trip });
  });
  app.get(
    "/api/trips/:id/pickup-route",
    auth,
    role("driver"),
    async (req, res) => {
      const trip = store.getTrip(req.params.id, req.user);
      assert(trip.driverId === req.user.id, 403, "Conductor no asignado");
      assert(trip.driverLocation, 409, "Compartí tu ubicación primero");
      res.json({ route: await route(trip.driverLocation, trip.pickup) });
    },
  );
  app.post("/api/trips/:id/location", auth, role("driver"), (req, res) => {
    const location = point(
      { ...req.body, label: "Ubicación del conductor" },
      "Ubicación",
    );
    const trip = store.updateDriverLocation(req.params.id, req.user, {
      lat: location.lat,
      lng: location.lng,
    });
    emit(trip);
    res.json({ trip });
  });
  app.get("/api/passes/current", auth, role("driver"), (req, res) =>
    res.json({ pass: store.currentPass(req.user.id) }),
  );
  app.post("/api/passes/demo-purchase", auth, role("driver"), (req, res) => {
    assert(demoAuth, 403, "Compra demo deshabilitada");
    assert(
      req.body?.acceptDemo === true,
      400,
      "Confirmá que esta compra es una simulación sin cobro",
    );
    const key = requestId(req.body?.requestId),
      previous = store.purchasedPass(req.user.id, key);
    if (previous) return res.json({ pass: previous });
    const pricing = store.config();
    assert(
      req.body?.currency === pricing.passCurrency &&
        req.body?.amount === pricing.passAmount,
      409,
      "La tarifa cambió. Revisá y confirmá nuevamente",
    );
    res.status(201).json({
      pass: store.purchasePass(req.user.id, requestId(req.body?.requestId)),
    });
  });
  app.post("/api/passes/activate", auth, role("driver"), (req, res) =>
    res.json({ pass: store.changePass(req.user.id, true) }),
  );
  app.post("/api/passes/pause", auth, role("driver"), (req, res) =>
    res.json({ pass: store.changePass(req.user.id, false) }),
  );
  app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof ApiError
        ? error.status
        : error.type === "entity.parse.failed"
          ? 400
          : error.type === "entity.too.large"
            ? 413
            : 500;
    if (status === 500) console.error("API error:", error.message);
    res.status(status).json({
      error:
        status === 500
          ? "Error interno del servidor"
          : status === 400 && !(error instanceof ApiError)
            ? "JSON inválido"
            : error.message,
    });
  });
  app.locals.store = store;
  app.locals.shutdown = () => {
    for (const clients of subscribers.values())
      for (const client of clients) client.end();
  };
  return app;
}
