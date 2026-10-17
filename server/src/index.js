import { resolve } from "node:path";
import { openStore } from "./store.js";
import { createApp } from "./app.js";
if (Number(process.versions.node.split(".")[0]) < 24)
  throw new Error(
    "BariGo API necesita Node.js 24 o posterior (SQLite integrado).",
  );
const store = openStore(resolve(process.env.DB_PATH || "data/barigo.sqlite"));
const app = createApp({ store });
const server = app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || "0.0.0.0",
  () =>
    console.log(
      `BariGo API en puerto ${process.env.PORT || 3001}. Auth demo: ${process.env.ENABLE_DEMO_AUTH === "true" && process.env.NODE_ENV !== "production"}`,
    ),
);
const shutdown = () => {
  app.locals.shutdown();
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
