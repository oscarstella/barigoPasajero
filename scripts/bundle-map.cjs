const fs = require("node:fs");
fs.writeFileSync(
  "src/components/leafletAssets.ts",
  "// Leaflet 1.9.4, BSD-2-Clause. See docs/LEAFLET-LICENSE.txt.\nexport const leafletJS = " +
    JSON.stringify(
      fs.readFileSync("node_modules/leaflet/dist/leaflet.js", "utf8"),
    ) +
    ";\nexport const leafletCSS = " +
    JSON.stringify(
      fs.readFileSync("node_modules/leaflet/dist/leaflet.css", "utf8"),
    ) +
    ";\n",
);
fs.copyFileSync("node_modules/leaflet/LICENSE", "docs/LEAFLET-LICENSE.txt");
