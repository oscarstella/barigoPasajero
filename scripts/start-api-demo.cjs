const { spawn } = require("node:child_process");
const path = require("node:path");
const child = spawn(process.execPath, ["src/index.js"], {
  cwd: path.resolve(__dirname, "../server"),
  env: { ...process.env, ENABLE_DEMO_AUTH: "true" },
  stdio: "inherit",
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
