export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const assert = (condition, status, message) => {
  if (!condition) throw new ApiError(status, message);
};
export function text(value, name, max = 120) {
  assert(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    400,
    `${name} inválido`,
  );
  return value.trim();
}
export function point(value, name) {
  assert(value && typeof value === "object", 400, `${name} inválido`);
  const { lat, lng } = value;
  assert(
    Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -41.3 &&
      lat <= -40.98 &&
      lng >= -71.65 &&
      lng <= -71.05,
    400,
    `${name} debe estar en Bariloche o alrededores`,
  );
  const result = { lat, lng, label: text(value.label, name, 200) };
  if (value.accuracyMeters !== undefined) {
    assert(
      Number.isFinite(value.accuracyMeters) &&
        value.accuracyMeters >= 0 &&
        value.accuracyMeters <= 10000,
      400,
      "Precisión GPS inválida",
    );
    result.accuracyMeters = value.accuracyMeters;
  }
  if (value.locationTimestamp !== undefined) {
    assert(
      typeof value.locationTimestamp === "string" &&
        value.locationTimestamp.length <= 40 &&
        Number.isFinite(Date.parse(value.locationTimestamp)),
      400,
      "Fecha GPS inválida",
    );
    result.locationTimestamp = new Date(value.locationTimestamp).toISOString();
  }
  if (["gps", "manual", "map"].includes(value.source))
    result.source = value.source;
  return result;
}
export const requestId = (value) => {
  const key = text(value, "requestId", 100);
  assert(
    /^[a-zA-Z0-9_-]{8,100}$/.test(key),
    400,
    "requestId debe tener 8 a 100 letras, números, guiones o guiones bajos",
  );
  return key;
};
