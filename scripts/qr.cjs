const os = require("node:os");
const fs = require("node:fs");
const QRCode = require("qrcode");
const entries = Object.entries(os.networkInterfaces()).flatMap(
  ([name, values]) =>
    (values || [])
      .filter(
        (v) =>
          v.family === "IPv4" &&
          !v.internal &&
          !v.address.startsWith("169.254."),
      )
      .map((v) => ({ name, address: v.address })),
);
const host =
  process.env.BARIGO_HOST ||
  entries.find((v) => /wi-fi|wlan|ethernet/i.test(v.name))?.address ||
  entries[0]?.address;
if (!host) throw Error("No se encontró una IP LAN. Conectá tu PC al Wi-Fi.");
fs.mkdirSync("artifacts", { recursive: true });
const url = `exp://${host}:8081`;
QRCode.toFile("artifacts/expo-go-qr.png", url, {
  width: 420,
  margin: 3,
  errorCorrectionLevel: "M",
}).then(() =>
  console.log(
    `Expo Go: ${url}\nBackend: http://${host}:3001\nGustavo: http://${host}:3001/demo/conductor\nQR: artifacts/expo-go-qr.png`,
  ),
);
