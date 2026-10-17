import AsyncStorage from "@react-native-async-storage/async-storage";
import { Place } from "../data/places";
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001"
).replace(/\/$/, "");
export type User = { id: string; name: string };
export type Quote = {
  route: {
    coordinates: number[][];
    distanceMeters: number;
    durationSeconds: number;
    steps?: unknown[];
  };
  estimate: { currency: string; amount: number };
};
export type Trip = {
  id: string;
  status: string;
  pickup: Place;
  destination: Place;
  estimate: { currency: string; amount: number };
  payment?: string;
  createdAt: string;
  [key: string]: any;
};
let token: string | null = null;
let pendingSession: Promise<User> | null = null;
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 18000);
  try {
    const response = await fetch(`${API_URL}/api${path}`, {
      method,
      signal: abort.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        typeof value.error === "string"
          ? value.error
          : value.error?.message ||
              value.message ||
              "No pudimos completar la operación.",
      );
    return value;
  } catch (error: any) {
    if (error.name === "AbortError")
      throw new Error("La conexión tardó demasiado. Volvé a intentar.");
    if (error instanceof TypeError)
      throw new Error(
        "No pudimos conectar con BariGo. Revisá que el servidor esté encendido y EXPO_PUBLIC_API_URL tenga la IP de tu PC.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
async function demo(name = "Oscar"): Promise<User> {
  const data = await request<{ token: string; user: User }>(
    "/auth/demo",
    "POST",
    { name, role: "passenger" },
  );
  token = data.token;
  await AsyncStorage.setItem("barigo-session", JSON.stringify(data));
  return data.user;
}
async function session(): Promise<User> {
  if (pendingSession) return pendingSession;
  pendingSession = (async () => {
    const saved = await AsyncStorage.getItem("barigo-session");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.token && data.user) {
          token = data.token;
          return data.user;
        }
      } catch {}
    }
    return demo();
  })();
  try {
    return await pendingSession;
  } finally {
    pendingSession = null;
  }
}
async function authorized<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  await session();
  return request<T>(path, method, body);
}
export const api = {
  demo,
  session,
  async updateName(name: string) {
    const data = await authorized<{ user: User }>("/me", "PATCH", { name });
    await AsyncStorage.setItem(
      "barigo-session",
      JSON.stringify({ token, user: data.user }),
    );
    return data.user;
  },
  async places(query: string) {
    return request<{ places: Place[]; warning?: string; source?: string }>(
      "/places?q=" + encodeURIComponent(query),
    );
  },
  async estimate(pickup: Place, destination: Place) {
    return authorized<Quote>("/estimates", "POST", { pickup, destination });
  },
  async request(
    pickup: Place,
    destination: Place,
    payment: string,
    confirmedEstimate?: { currency: string; amount: number },
  ) {
    const data = await authorized<{ trip: Trip }>("/trips", "POST", {
      pickup,
      destination,
      payment,
      confirmedEstimate,
      requestId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    return data.trip;
  },
  async trip(id: string) {
    return (
      await authorized<{ trip: Trip }>("/trips/" + encodeURIComponent(id))
    ).trip;
  },
  async trips() {
    return (await authorized<{ trips: Trip[] }>("/trips")).trips;
  },
  async cancel(id: string) {
    return (
      await authorized<{ trip: Trip }>(
        `/trips/${encodeURIComponent(id)}/cancel`,
        "POST",
        {},
      )
    ).trip;
  },
};
