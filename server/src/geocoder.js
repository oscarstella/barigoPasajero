import { searchPlaces } from "./places.js";
const BBOX = [-71.65, -41.3, -71.05, -40.98];
const inArea = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lng >= BBOX[0] &&
  lat >= BBOX[1] &&
  lng <= BBOX[2] &&
  lat <= BBOX[3];
export function photonPlace(feature) {
  const coordinates = feature?.geometry?.coordinates,
    properties = feature?.properties;
  if (
    !Array.isArray(coordinates) ||
    !properties ||
    !inArea(coordinates[1], coordinates[0])
  )
    return null;
  const p = properties,
    houseNumber = p.housenumber
      ? String(p.housenumber).slice(0, 30)
      : undefined;
  const street = p.street || (p.osm_key === "highway" ? p.name : undefined);
  const address = [street, houseNumber].filter(Boolean).join(" ");
  const label =
    p.name && p.name !== street
      ? p.name
      : address || p.name || p.city || "Lugar en Bariloche";
  const detail = [
    address && address !== label ? address : null,
    p.city || p.district || "Bariloche",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `photon-${p.osm_type || "place"}-${p.osm_id || coordinates.join(",")}`,
    label: String(label).slice(0, 200),
    detail,
    address: detail,
    lat: coordinates[1],
    lng: coordinates[0],
    precision:
      houseNumber && street
        ? "address"
        : street && (!p.name || p.name === street)
          ? "street"
          : "place",
    ...(houseNumber ? { houseNumber } : {}),
    source: "OpenStreetMap / Photon",
  };
}
export function createGeocoder({
  fetcher = fetch,
  baseUrl = process.env.PHOTON_URL || "https://photon.komoot.io/api/",
  clock = Date.now,
} = {}) {
  const cache = new Map(),
    inflight = new Map();
  let lastRequest = 0;
  return async function geocode(query) {
    const q = typeof query === "string" ? query.trim().slice(0, 100) : "";
    const local = searchPlaces(q).map((p) => ({
      ...p,
      detail: p.address,
      precision: "place",
      source: "Catálogo local",
    }));
    if (q.length < 3)
      return {
        places: local,
        source: "Catálogo local",
        warning:
          "Escribí al menos 3 caracteres para buscar calles, alturas y establecimientos.",
      };
    const key = q.toLocaleLowerCase("es"),
      cached = cache.get(key);
    if (cached && cached.expires > clock()) return cached.value;
    if (inflight.has(key)) return inflight.get(key);
    // Global modest upstream rate: client also debounces, cached matches never call Photon.
    const delay = Math.max(0, lastRequest + 400 - clock());
    lastRequest = clock() + delay;
    const promise = (async () => {
      if (delay)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, 2000)),
        );
      try {
        const url = new URL(baseUrl);
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "8");
        url.searchParams.set("lat", "-41.13");
        url.searchParams.set("lon", "-71.31");
        url.searchParams.set("lang", "default");
        url.searchParams.set("bbox", BBOX.join(","));
        const response = await fetcher(url, {
          signal: AbortSignal.timeout(6000),
          headers: {
            Accept: "application/json",
            "User-Agent": "BariGo-Development/0.1",
          },
        });
        if (!response.ok) throw new Error("upstream");
        const data = await response.json();
        if (!Array.isArray(data.features)) throw new Error("invalid");
        const external = data.features.map(photonPlace).filter(Boolean),
          all = [...external, ...local];
        const seen = new Set(),
          places = all
            .filter((p) => {
              const key = `${p.label.toLowerCase()}:${p.lat.toFixed(4)}:${p.lng.toFixed(4)}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, 12);
        const value = {
          places,
          source: "OpenStreetMap / Photon + catálogo local",
          warning:
            "Cobertura de OpenStreetMap: algunas calles, alturas o comercios pueden faltar. Verificá el punto en el mapa.",
        };
        cache.set(key, { expires: clock() + 60000, value });
        if (cache.size > 300) cache.delete(cache.keys().next().value);
        return value;
      } catch {
        return {
          places: local,
          source: "Catálogo local",
          warning:
            "No pudimos consultar direcciones y establecimientos. Mostramos sólo lugares del catálogo local; intentá nuevamente.",
        };
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  };
}
export const geocodePlaces = createGeocoder();
