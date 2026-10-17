import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ApiError, assert } from "./errors.js";
const hash = (token) => createHash("sha256").update(token).digest("hex");
export const PASS_MS = 12 * 60 * 60 * 1000;
export const EXPIRY_MS = 24 * 60 * 60 * 1000;
export function openStore(filename = ":memory:", clock = Date.now) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS passes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,purchased_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,remaining_ms INTEGER NOT NULL,active_since INTEGER,currency TEXT NOT NULL,amount INTEGER NOT NULL,UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS pass_ledger(id TEXT PRIMARY KEY,pass_id TEXT NOT NULL REFERENCES passes(id),event TEXT NOT NULL,at INTEGER NOT NULL,remaining_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,driver_id TEXT REFERENCES users(id),status TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS trip_events(id TEXT PRIMARY KEY,trip_id TEXT NOT NULL REFERENCES trips(id),status TEXT NOT NULL,at INTEGER NOT NULL);
    INSERT OR IGNORE INTO config VALUES ('pricing','{"passAmount":7500,"passCurrency":"ARS","baseFare":1800,"perKm":950,"perMinute":80}');`);
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  function config() {
    return JSON.parse(
      db.prepare("SELECT value FROM config WHERE key=?").get("pricing").value,
    );
  }
  function setConfig(value) {
    db.prepare("UPDATE config SET value=? WHERE key=?").run(
      JSON.stringify(value),
      "pricing",
    );
    return config();
  }
  function demoUser(name, role) {
    const stable = ["Oscar", "Gustavo"].includes(name)
      ? db
          .prepare("SELECT * FROM users WHERE id=?")
          .get("demo-" + role + "-" + name.toLowerCase())
      : null;
    const user = stable || {
      id: ["Oscar", "Gustavo"].includes(name)
        ? "demo-" + role + "-" + name.toLowerCase()
        : randomUUID(),
      name,
      role,
    };
    const token = randomBytes(32).toString("hex");
    transaction(() => {
      db.prepare("INSERT OR IGNORE INTO users VALUES (?,?,?)").run(
        user.id,
        name,
        role,
      );
      db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
        hash(token),
        user.id,
        clock() + EXPIRY_MS,
      );
    });
    return {
      token,
      user,
      expiresAt: new Date(clock() + EXPIRY_MS).toISOString(),
      demo: true,
    };
  }
  function updateName(user, name) {
    db.prepare("UPDATE users SET name=? WHERE id=?").run(name, user.id);
    return { ...user, name };
  }
  function purchasedPass(userId, key) {
    return transaction(() => {
      const now = clock();
      return viewPass(
        syncPass(
          db
            .prepare("SELECT * FROM passes WHERE user_id=? AND request_key=?")
            .get(userId, key),
          now,
        ),
        now,
      );
    });
  }
  function authenticate(token) {
    if (typeof token !== "string" || token.length > 200) return null;
    return (
      db
        .prepare(
          "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
        )
        .get(hash(token), clock()) ?? null
    );
  }
  function ledger(pass, event, at) {
    db.prepare("INSERT INTO pass_ledger VALUES (?,?,?,?,?)").run(
      randomUUID(),
      pass.id,
      event,
      at,
      pass.remaining_ms,
    );
  }
  function syncPass(pass, now) {
    if (!pass) return null;
    if (pass.active_since !== null) {
      const end = Math.min(now, pass.expires_at);
      pass.remaining_ms = Math.max(
        0,
        pass.remaining_ms - Math.max(0, end - pass.active_since),
      );
      pass.active_since =
        pass.remaining_ms > 0 && now < pass.expires_at ? now : null;
      db.prepare(
        "UPDATE passes SET remaining_ms=?,active_since=? WHERE id=?",
      ).run(pass.remaining_ms, pass.active_since, pass.id);
    }
    if (now >= pass.expires_at) {
      // Wall-clock expiry always wins, including time paused.
      if (pass.remaining_ms > 0) {
        pass.remaining_ms = 0;
        db.prepare(
          "UPDATE passes SET remaining_ms=0,active_since=NULL WHERE id=?",
        ).run(pass.id);
        ledger(pass, "expired", now);
      }
      pass.active_since = null;
    }
    return pass;
  }
  function latestPass(userId, now) {
    return syncPass(
      db
        .prepare(
          "SELECT * FROM passes WHERE user_id=? ORDER BY purchased_at DESC,rowid DESC LIMIT 1",
        )
        .get(userId),
      now,
    );
  }
  function viewPass(pass, now) {
    if (!pass) return null;
    return {
      id: pass.id,
      currency: pass.currency,
      amount: pass.amount,
      purchasedAt: new Date(pass.purchased_at).toISOString(),
      expiresAt: new Date(pass.expires_at).toISOString(),
      remainingMs: pass.remaining_ms,
      active: pass.active_since !== null,
      status:
        now >= pass.expires_at
          ? "expired"
          : pass.remaining_ms <= 0
            ? "exhausted"
            : pass.active_since !== null
              ? "active"
              : "paused",
      demo: true,
    };
  }
  function currentPass(userId) {
    return transaction(() => {
      const now = clock();
      return viewPass(latestPass(userId, now), now);
    });
  }
  function purchasePass(userId, key) {
    return transaction(() => {
      const now = clock();
      const existing = db
        .prepare("SELECT * FROM passes WHERE user_id=? AND request_key=?")
        .get(userId, key);
      if (existing) return viewPass(syncPass(existing, now), now);
      const previous = latestPass(userId, now);
      assert(
        !previous || previous.remaining_ms <= 0 || previous.expires_at <= now,
        409,
        "Ya tenés un pase vigente",
      );
      const pricing = config();
      const pass = {
        id: randomUUID(),
        user_id: userId,
        request_key: key,
        purchased_at: now,
        expires_at: now + EXPIRY_MS,
        remaining_ms: PASS_MS,
        active_since: null,
        currency: pricing.passCurrency,
        amount: pricing.passAmount,
      };
      db.prepare("INSERT INTO passes VALUES (?,?,?,?,?,?,?,?,?)").run(
        ...Object.values(pass),
      );
      ledger(pass, "demo_purchase", now);
      return viewPass(pass, now);
    });
  }
  function changePass(userId, active) {
    return transaction(() => {
      const now = clock();
      const pass = latestPass(userId, now);
      assert(
        pass && now < pass.expires_at && pass.remaining_ms > 0,
        409,
        "No tenés un pase vigente con tiempo disponible",
      );
      if ((pass.active_since !== null) !== active) {
        pass.active_since = active ? now : null;
        db.prepare("UPDATE passes SET active_since=? WHERE id=?").run(
          pass.active_since,
          pass.id,
        );
        ledger(pass, active ? "activated" : "paused", now);
      }
      return viewPass(pass, now);
    });
  }
  function toTrip(row) {
    return row
      ? {
          ...JSON.parse(row.payload),
          id: row.id,
          userId: row.user_id,
          driverId: row.driver_id,
          status: row.status,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        }
      : null;
  }
  function getTrip(id, user) {
    const row = db.prepare("SELECT * FROM trips WHERE id=?").get(id);
    assert(
      row && (row.user_id === user.id || row.driver_id === user.id),
      404,
      "Viaje no encontrado",
    );
    return toTrip(row);
  }
  function listTrips(user) {
    return db
      .prepare(
        "SELECT * FROM trips WHERE user_id=? OR driver_id=? ORDER BY created_at DESC LIMIT 100",
      )
      .all(user.id, user.id)
      .map(toTrip);
  }
  function existingTrip(userId, key) {
    return toTrip(
      db
        .prepare("SELECT * FROM trips WHERE user_id=? AND request_key=?")
        .get(userId, key),
    );
  }
  function createTrip(userId, key, payload) {
    return transaction(() => {
      const previous = existingTrip(userId, key);
      if (previous) return previous;
      assert(
        !db
          .prepare(
            "SELECT id FROM trips WHERE user_id=? AND status NOT IN ('completed','cancelled')",
          )
          .get(userId),
        409,
        "Ya tenés un viaje en curso",
      );
      const id = randomUUID(),
        now = clock();
      db.prepare("INSERT INTO trips VALUES (?,?,?,?,?,?,?,?)").run(
        id,
        userId,
        key,
        null,
        "searching",
        JSON.stringify(payload),
        now,
        now,
      );
      db.prepare("INSERT INTO trip_events VALUES (?,?,?,?)").run(
        randomUUID(),
        id,
        "searching",
        now,
      );
      return toTrip(db.prepare("SELECT * FROM trips WHERE id=?").get(id));
    });
  }
  function availableTrips() {
    return db
      .prepare(
        "SELECT * FROM trips WHERE status='searching' ORDER BY created_at LIMIT 30",
      )
      .all()
      .map((row) => {
        const trip = toTrip(row);
        delete trip.userId;
        return trip;
      });
  }
  function acceptTrip(id, user) {
    return transaction(() => {
      const now = clock(),
        pass = latestPass(user.id, now);
      assert(
        pass &&
          pass.active_since !== null &&
          pass.remaining_ms > 0 &&
          pass.expires_at > now,
        409,
        "Activá un pase vigente para aceptar viajes",
      );
      assert(
        !db
          .prepare(
            "SELECT id FROM trips WHERE driver_id=? AND status NOT IN ('completed','cancelled')",
          )
          .get(user.id),
        409,
        "Ya tenés un viaje en curso",
      );
      const result = db
        .prepare(
          "UPDATE trips SET driver_id=?,status='accepted',updated_at=? WHERE id=? AND status='searching' AND driver_id IS NULL",
        )
        .run(user.id, now, id);
      assert(result.changes === 1, 409, "El viaje ya no está disponible");
      const row = db.prepare("SELECT payload FROM trips WHERE id=?").get(id),
        payload = JSON.parse(row.payload);
      payload.driver = { name: user.name };
      payload.messages = [
        ...(payload.messages || []),
        {
          id: randomUUID(),
          type: "system",
          text: user.name + " aceptó tu viaje.",
          at: new Date(now).toISOString(),
        },
      ];
      db.prepare("UPDATE trips SET payload=? WHERE id=?").run(
        JSON.stringify(payload),
        id,
      );
      db.prepare("INSERT INTO trip_events VALUES (?,?,?,?)").run(
        randomUUID(),
        id,
        "accepted",
        now,
      );
      return getTrip(id, user);
    });
  }
  function transitionTrip(id, user, status) {
    return transaction(() => {
      const trip = getTrip(id, user);
      if (trip.status === status) return trip;
      const next = {
        accepted: "arriving",
        arriving: "arrived",
        arrived: "in_progress",
        in_progress: "completed",
      };
      if (status === "cancelled")
        assert(
          !["in_progress", "completed", "cancelled"].includes(trip.status),
          409,
          "Este viaje ya no se puede cancelar",
        );
      else {
        assert(
          user.role === "driver" && trip.driverId === user.id,
          403,
          "Sólo el conductor asignado puede actualizar el viaje",
        );
        assert(
          next[trip.status] === status,
          409,
          "Transición de viaje inválida",
        );
      }
      const row = db.prepare("SELECT payload FROM trips WHERE id=?").get(id),
        payload = JSON.parse(row.payload);
      const notices = {
        arriving: "Tu conductor está yendo al punto de encuentro.",
        arrived: "Tu conductor llegó al punto de encuentro.",
        in_progress: "El viaje comenzó.",
        completed: "El viaje finalizó.",
        cancelled: "El viaje fue cancelado.",
      };
      payload.messages = [
        ...(payload.messages || []),
        {
          id: randomUUID(),
          type: "system",
          text: notices[status],
          at: new Date(clock()).toISOString(),
        },
      ];
      db.prepare(
        "UPDATE trips SET status=?,payload=?,updated_at=? WHERE id=?",
      ).run(status, JSON.stringify(payload), clock(), id);
      db.prepare("INSERT INTO trip_events VALUES (?,?,?,?)").run(
        randomUUID(),
        id,
        status,
        clock(),
      );
      return getTrip(id, user);
    });
  }
  function updateDriverLocation(id, user, location) {
    return transaction(() => {
      const trip = getTrip(id, user);
      assert(
        user.role === "driver" && trip.driverId === user.id,
        403,
        "Sólo el conductor asignado puede compartir ubicación",
      );
      assert(
        !["completed", "cancelled"].includes(trip.status),
        409,
        "El viaje terminó",
      );
      const row = db.prepare("SELECT payload FROM trips WHERE id=?").get(id),
        payload = JSON.parse(row.payload);
      payload.driverLocation = {
        ...location,
        at: new Date(clock()).toISOString(),
      };
      db.prepare("UPDATE trips SET payload=?,updated_at=? WHERE id=?").run(
        JSON.stringify(payload),
        clock(),
        id,
      );
      return getTrip(id, user);
    });
  }
  return {
    db,
    config,
    setConfig,
    demoUser,
    updateName,
    purchasedPass,
    authenticate,
    currentPass,
    purchasePass,
    changePass,
    getTrip,
    listTrips,
    existingTrip,
    createTrip,
    availableTrips,
    acceptTrip,
    transitionTrip,
    updateDriverLocation,
    close: () => db.close(),
  };
}
