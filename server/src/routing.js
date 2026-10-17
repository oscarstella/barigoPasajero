import { ApiError, assert } from "./errors.js";
export async function streetRoute(
  pickup,
  destination,
  {
    baseUrl = process.env.OSRM_URL || "https://router.project-osrm.org",
    fetcher = fetch,
  } = {},
) {
  let response;
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;
    response = await fetcher(url, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json" },
    });
    assert(
      response.ok,
      503,
      "El servicio de recorridos no está disponible. Intentá de nuevo.",
    );
    const data = await response.json();
    const route = data.routes?.[0];
    assert(
      data.code === "Ok" &&
        route?.geometry?.coordinates?.length > 1 &&
        Number.isFinite(route.distance) &&
        Number.isFinite(route.duration),
      422,
      "No se encontró un recorrido por calles para esos puntos",
    );
    const steps = (route.legs ?? [])
      .flatMap((leg) => leg.steps ?? [])
      .map((step) => ({
        street: step.name || "calle sin nombre",
        distanceMeters: step.distance,
        durationSeconds: step.duration,
        maneuver: {
          type: step.maneuver?.type,
          modifier: step.maneuver?.modifier,
          location: step.maneuver?.location,
        },
        instruction: instruction(step),
      }));
    return {
      coordinates: route.geometry.coordinates,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      steps,
      provider: "OSRM / OpenStreetMap",
      liveTraffic: false,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      "No pudimos obtener el recorrido por calles. Revisá tu conexión e intentá nuevamente.",
    );
  }
}
function instruction(step) {
  const street = step.name ? ` por ${step.name}` : "";
  const directions = {
    left: "a la izquierda",
    right: "a la derecha",
    "slight left": "levemente a la izquierda",
    "slight right": "levemente a la derecha",
    "sharp left": "a la izquierda",
    "sharp right": "a la derecha",
    straight: "derecho",
    uturn: "en U",
  };
  const modifier = directions[step.maneuver?.modifier] || "";
  switch (step.maneuver?.type) {
    case "depart":
      return `Comenzá el recorrido${street}`;
    case "arrive":
      return "Llegaste a destino";
    case "roundabout":
    case "rotary":
      return `Tomá la rotonda${step.maneuver.exit ? ` y la salida ${step.maneuver.exit}` : ""}${street}`;
    case "turn":
      return `Girá ${modifier}${street}`.trim();
    case "merge":
      return `Incorporate ${modifier}${street}`.trim();
    case "fork":
      return `Mantenete ${modifier}${street}`.trim();
    default:
      return `Continuá ${modifier}${street}`.trim();
  }
}
export function estimateFare(route, pricing) {
  return {
    currency: "ARS",
    amount:
      Math.round(
        (pricing.baseFare +
          (route.distanceMeters / 1000) * pricing.perKm +
          (route.durationSeconds / 60) * pricing.perMinute) /
          100,
      ) * 100,
    indicative: true,
  };
}
