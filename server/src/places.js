// Curated local search: no public Nominatim autocomplete requests.
export const places = [
  ["centro-civico", "Centro Cívico", -41.1335, -71.3103, "Centro, Bariloche"],
  [
    "aeropuerto",
    "Aeropuerto Internacional Teniente Luis Candelaria",
    -41.1512,
    -71.1575,
    "Aeropuerto de Bariloche",
  ],
  [
    "terminal",
    "Terminal de Ómnibus",
    -41.1331,
    -71.2775,
    "12 de Octubre 2400, Bariloche",
  ],
  [
    "catedral",
    "Catedral Nuestra Señora del Nahuel Huapi",
    -41.132,
    -71.3017,
    "Centro, Bariloche",
  ],
  ["playa-bonita", "Playa Bonita", -41.1211, -71.4054, "Av. Bustillo km 8"],
  ["cerro-catedral", "Cerro Catedral", -41.1674, -71.4404, "Villa Catedral"],
  ["llao-llao", "Hotel Llao Llao", -41.0575, -71.5316, "Av. Bustillo km 25"],
  ["puerto-panuelo", "Puerto Pañuelo", -41.0564, -71.5375, "Llao Llao"],
  [
    "campanario",
    "Cerro Campanario",
    -41.0894,
    -71.5094,
    "Av. Bustillo km 17.5",
  ],
  [
    "gutiérrez",
    "Lago Gutiérrez · Villa Los Coihues",
    -41.1717,
    -71.411,
    "Villa Los Coihues",
  ],
  ["melipal", "Melipal", -41.1272, -71.3528, "Av. Bustillo km 4"],
  ["dina-huapi", "Dina Huapi", -41.0739, -71.1646, "Dina Huapi"],
  [
    "hospital",
    "Hospital Zonal Ramón Carrillo",
    -41.1433,
    -71.3067,
    "Elflein 534, Bariloche",
  ],
  [
    "cerro-otto",
    "Teleférico Cerro Otto",
    -41.1311,
    -71.3677,
    "Av. Pioneros km 5",
  ],
  ["nahuel-malal", "Nahuel Malal", -41.098, -71.454, "Av. Bustillo km 12"],
].map(([id, label, lat, lng, address]) => ({ id, label, lat, lng, address }));
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function searchPlaces(query = "") {
  const q = normalize(String(query).slice(0, 100).trim());
  return places
    .filter((p) => !q || normalize(`${p.label} ${p.address}`).includes(q))
    .slice(0, 10);
}
