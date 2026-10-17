import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Feather from "@expo/vector-icons/Feather";
import * as Location from "expo-location";
import RouteMap from "./src/components/RouteMap";
import { places, Place, insideServiceArea } from "./src/data/places";
import { api, API_URL } from "./src/services/api";
import { colors as c } from "./src/theme";

type IconName = React.ComponentProps<typeof Feather>["name"];
const money = (n: number = 0) => "$ " + Math.round(n).toLocaleString("es-AR");
function Icon({
  name,
  size = 20,
  color = c.forest,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
}
function Button({
  title,
  onPress,
  loading = false,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.lime} />
      ) : (
        <>
          <Text style={[s.buttonText, secondary && { color: c.forest }]}>
            {title}
          </Text>
          <Icon name="arrow-up-right" color={secondary ? c.forest : c.lime} />
        </>
      )}
    </Pressable>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Passenger />
    </SafeAreaProvider>
  );
}
function Passenger() {
  const [tab, setTab] = useState("Inicio");
  const [pickup, setPickup] = useState<Place>(places[0]);
  const [destination, setDestination] = useState<Place | null>(null);
  const [search, setSearch] = useState<"pickup" | "destination" | null>(null);
  const [query, setQuery] = useState("");
  const [remotePlaces, setRemotePlaces] = useState<Place[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchWarning, setSearchWarning] = useState("");
  const [searchError, setSearchError] = useState("");
  const searchVersion = useRef(0);
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState("cash");
  const [confirm, setConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [trip, setTrip] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [name, setName] = useState("Oscar");
  const [editName, setEditName] = useState("");
  const [edit, setEdit] = useState(false);
  const [simulation, setSimulation] = useState(-1);
  const [locating, setLocating] = useState(false);
  const requestVersion = useRef(0);
  const route: number[][] = quote?.route?.coordinates || [];
  const simDone = simulation >= 12;
  const driver =
    simulation >= 0 && route.length
      ? {
          lng: route[
            Math.min(
              route.length - 1,
              Math.floor((simulation / 12) * (route.length - 1)),
            )
          ][0],
          lat: route[
            Math.min(
              route.length - 1,
              Math.floor((simulation / 12) * (route.length - 1)),
            )
          ][1],
        }
      : trip?.driverLocation
        ? { lat: trip.driverLocation.lat, lng: trip.driverLocation.lng }
        : undefined;
  useEffect(() => {
    const version = ++searchVersion.current;
    setSearchError("");
    setSearchWarning("");
    setRemotePlaces([]);
    if (!search || query.trim().length < 3) {
      setSearchBusy(false);
      return;
    }
    setSearchBusy(true);
    const timer = setTimeout(() => {
      api
        .places(query.trim())
        .then((result) => {
          if (version !== searchVersion.current) return;
          setRemotePlaces(result.places);
          setSearchWarning(result.warning || "");
        })
        .catch((e: any) => {
          if (version === searchVersion.current)
            setSearchError(
              e.message || "No pudimos buscar direcciones. Volvé a intentar.",
            );
        })
        .finally(() => {
          if (version === searchVersion.current) setSearchBusy(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      searchVersion.current++;
    };
  }, [query, search]);
  useEffect(() => {
    api
      .session()
      .then((user) => {
        setName(user.name);
        return api.trips();
      })
      .then((items) => {
        setHistory(items);
        restoreActive(items);
      })
      .catch((e: any) =>
        setError(e.message || "No pudimos conectar con el servidor."),
      );
  }, []);
  useEffect(() => {
    if (
      !trip ||
      simulation >= 0 ||
      ["cancelled", "completed"].includes(trip.status)
    )
      return;
    let stopped = false;
    const timer = setInterval(() => {
      api
        .trip(trip.id)
        .then((value) => {
          if (!stopped) {
            setTrip(value);
            if (["cancelled", "completed"].includes(value.status))
              void api
                .trips()
                .then(setHistory)
                .catch(() => {});
          }
        })
        .catch(() => {
          if (!stopped)
            setError(
              "La conexión con el viaje se interrumpió. Reintentamos actualizar el estado automáticamente.",
            );
        });
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [trip?.id, trip?.status, simulation]);
  useEffect(() => {
    if (simulation < 0 || simDone) return;
    const timer = setTimeout(() => setSimulation((v) => v + 1), 2000);
    return () => clearTimeout(timer);
  }, [simulation]);
  function restoreActive(items: any[]) {
    const active = items.find((t) =>
      [
        "searching",
        "requested",
        "accepted",
        "arriving",
        "arrived",
        "in_progress",
      ].includes(t.status),
    );
    if (active) {
      setTrip(active);
      setPickup(active.pickup);
      setDestination(active.destination);
      if (active.route)
        setQuote({ route: active.route, estimate: active.estimate });
      else void estimate(active.pickup, active.destination);
    }
  }
  function canChange() {
    if (trip && ["cancelled", "completed"].includes(trip.status)) {
      setTrip(null);
      setSimulation(-1);
      return true;
    }
    if (trip) {
      setError(
        "Tenés una solicitud activa. Cancelala antes de elegir otro viaje.",
      );
      return false;
    }
    return true;
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const items = await api.trips();
      setHistory(items);
      restoreActive(items);
    } catch (e) {
      setError("No pudimos cargar tus viajes. Revisá la conexión al servidor.");
    } finally {
      setBusy(false);
    }
  }
  async function estimate(a: Place, b: Place) {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      const value = await api.estimate(a, b);
      if (version === requestVersion.current) setQuote(value);
    } catch (e: any) {
      if (version === requestVersion.current)
        setError(
          e.message || "No pudimos calcular el recorrido. Intentá nuevamente.",
        );
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  function select(p: Place) {
    if (!canChange()) return;
    const field = search;
    setSearch(null);
    setQuery("");
    setTrip(null);
    setSimulation(-1);
    if (field === "pickup") {
      setPickup(p);
      if (destination) void estimate(p, destination);
    } else {
      setDestination(p);
      void estimate(pickup, p);
    }
  }
  async function locate() {
    if (!canChange()) return;
    setLocating(true);
    setError("");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error("Habilitá la ubicación para usar tu posición actual.");
      const { coords, timestamp } = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "El GPS tardó demasiado. Acercate a un lugar abierto y volvé a intentar.",
                ),
              ),
            15000,
          );
        }),
      ]);
      if (!insideServiceArea({ lat: coords.latitude, lng: coords.longitude }))
        throw new Error(
          "BariGo está disponible en Bariloche y alrededores. Elegí un punto dentro de la zona.",
        );
      const point = {
        id: "current",
        label: "Mi ubicación GPS",
        detail:
          coords.accuracy != null
            ? `Precisión aproximada ±${Math.round(coords.accuracy)} m`
            : "Precisión no informada por el dispositivo",
        source: "gps" as const,
        accuracyMeters: coords.accuracy ?? undefined,
        locationTimestamp: new Date(timestamp).toISOString(),
        lat: coords.latitude,
        lng: coords.longitude,
      };
      setPickup(point);
      if (destination) void estimate(point, destination);
    } catch (e: any) {
      setError(e.message || "No pudimos obtener tu ubicación.");
    } finally {
      if (timeout) clearTimeout(timeout);
      setLocating(false);
    }
  }
  async function request() {
    if (!destination || trip || busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await api.request(
        pickup,
        destination,
        payment as any,
        quote?.estimate,
      );
      setTrip(value);
      setConfirm(false);
      setSimulation(-1);
      setHistory(await api.trips());
    } catch (e: any) {
      setConfirm(false);
      if (/precio|tarifa|estimaci|cambi|409/i.test(e.message || "")) {
        await estimate(pickup, destination);
        setError(
          "La estimación cambió. Revisá el nuevo importe y confirmá otra vez.",
        );
      } else setError(e.message || "No pudimos guardar la solicitud.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      await api.cancel(trip.id);
      setTrip(null);
      setSimulation(-1);
      setCancelConfirm(false);
      setHistory(await api.trips());
    } catch (e: any) {
      setError(e.message || "No pudimos cancelar el viaje.");
    } finally {
      setBusy(false);
    }
  }
  const localMatches = places.filter((p) =>
    (p.label + " " + p.detail)
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(
        query
          .toLocaleLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, ""),
      ),
  );
  const matches = query.trim().length >= 3 ? remotePlaces : localMatches;
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.shell}>
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <View style={s.brand}>
              <View style={s.logo}>
                <Icon name="navigation" size={22} color={c.lime} />
              </View>
              <Text style={s.wordmark}>
                BariGo<Text style={{ color: "#739079" }}>.</Text>
              </Text>
            </View>
            <View style={s.locality}>
              <View style={s.dot} />
              <Text style={s.localityText}>BARILOCHE</Text>
            </View>
          </View>
          {tab === "Inicio" ? (
            <>
              <View style={s.intro}>
                <Text style={s.eyebrow}>ACÁ CERCA. A TU RITMO.</Text>
                <Text style={s.title}>
                  Tu próximo destino,{"\n"}queda cerca.
                </Text>
                <Text style={s.subtitle}>
                  La ciudad que querés, a un viaje de distancia.
                </Text>
              </View>
              <View style={s.categoryRow}>
                <Pressable
                  style={s.category}
                  onPress={() => {
                    if (!canChange()) return;
                    requestVersion.current++;
                    setBusy(false);
                    setTrip(null);
                    setDestination(null);
                    setQuote(null);
                    setSimulation(-1);
                  }}
                >
                  <Icon name="navigation" size={17} />
                  <Text style={s.categoryText}>Viajar</Text>
                </Pressable>
                <Pressable
                  style={s.categoryPlain}
                  onPress={() => {
                    if (!canChange()) return;
                    const p = places.find((p) => /aeropuerto/i.test(p.label));
                    if (p) {
                      setDestination(p);
                      setTrip(null);
                      void estimate(pickup, p);
                    }
                  }}
                >
                  <Icon name="send" size={17} />
                  <Text style={s.categoryText}>Aeropuerto</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Text style={s.miniText}>Hecho para acá ↗</Text>
              </View>
              <View style={s.form}>
                <View style={s.fieldRow}>
                  <View style={s.originDot} />
                  <Pressable
                    style={s.field}
                    onPress={() => {
                      if (!canChange()) return;
                      setSearch("pickup");
                      setQuery("");
                    }}
                  >
                    <Text style={s.fieldLabel}>SALÍS DE</Text>
                    <Text numberOfLines={1} style={s.fieldValue}>
                      {pickup.label}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Usar mi ubicación"
                    style={s.location}
                    onPress={locate}
                  >
                    {locating ? (
                      <ActivityIndicator size="small" color={c.forest} />
                    ) : (
                      <Icon name="crosshair" size={19} />
                    )}
                  </Pressable>
                </View>
                <View style={s.formDivider} />
                <View style={s.fieldRow}>
                  <View style={s.destinationDot} />
                  <Pressable
                    style={s.field}
                    onPress={() => {
                      if (!canChange()) return;
                      setSearch("destination");
                      setQuery("");
                    }}
                  >
                    <Text style={s.fieldLabel}>VAS A</Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        s.fieldValue,
                        !destination && { color: "#829087" },
                      ]}
                    >
                      {destination?.label || "¿A dónde vamos?"}
                    </Text>
                  </Pressable>
                  <Icon name="search" size={20} />
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={locating}
                onPress={locate}
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  marginTop: -8,
                  marginBottom: 10,
                  paddingVertical: 10,
                }}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={c.forest} />
                ) : (
                  <Icon name="crosshair" size={18} />
                )}
                <Text style={s.link}>
                  {locating ? "Buscando tu posición…" : "Usar mi ubicación GPS"}
                </Text>
              </Pressable>
              {(pickup as any).source === "gps" ? (
                <Text style={[s.note, { marginTop: -5, marginBottom: 15 }]}>
                  {pickup.detail} · Capturada{" "}
                  {new Date(
                    (pickup as any).locationTimestamp,
                  ).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  . Verificá el punto de encuentro en el mapa.
                </Text>
              ) : null}
              {error ? (
                <View style={s.error}>
                  <Icon name="alert-circle" color={c.danger} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}
              {error && destination && !quote && !busy && !trip ? (
                <View style={{ marginBottom: 16 }}>
                  <Button
                    title="Reintentar recorrido"
                    secondary
                    onPress={() => void estimate(pickup, destination)}
                  />
                </View>
              ) : null}
              <View style={s.mapCard}>
                <RouteMap
                  pickup={pickup}
                  destination={destination as any}
                  route={route as any}
                  driver={driver}
                  height={240}
                />
                <View style={s.mapBadge}>
                  <View style={s.dot} />
                  <Text style={s.mapBadgeText}>Bariloche y alrededores</Text>
                </View>
              </View>
              {busy && !quote ? (
                <View style={s.loading}>
                  <ActivityIndicator color={c.forest} />
                  <Text style={s.subtitle}>
                    Buscando el mejor recorrido por calles…
                  </Text>
                </View>
              ) : null}
              {trip ? (
                <View style={s.tripCard}>
                  <View style={s.sectionRow}>
                    <Text style={s.eyebrow}>SOLICITUD DE DEMOSTRACIÓN</Text>
                    <Icon name="radio" />
                  </View>
                  <Text style={s.cardTitle}>
                    {simulation < 0
                      ? (
                          {
                            searching: "Buscando en modo demo",
                            requested: "Solicitud registrada",
                            accepted: "Gustavo aceptó tu viaje de prueba",
                            arriving: "Gustavo está llegando · demo",
                            arrived:
                              "Gustavo llegó al punto de encuentro · demo",
                            in_progress: "Viaje de prueba en curso",
                            completed: "Viaje de prueba finalizado",
                            cancelled: "Solicitud cancelada",
                          } as Record<string, string>
                        )[trip.status] || "Solicitud de prueba"
                      : simDone
                        ? "Simulación finalizada"
                        : simulation < 6
                          ? "Gustavo se acerca · demo"
                          : "En camino a tu destino"}
                  </Text>
                  <Text style={s.subtitle}>
                    {simulation >= 0
                      ? "Simulación local · Gustavo es un conductor de prueba."
                      : "Cuenta de prueba de Oscar · sin viajes reales. El estado se actualiza desde el servidor."}
                  </Text>
                  {simulation < 0 && Array.isArray(trip.messages)
                    ? trip.messages.slice(-3).map((m: any, i: number) => (
                        <View key={m.id || i} style={s.message}>
                          <Icon name="message-circle" size={18} />
                          <Text style={s.messageText}>
                            {typeof m === "string"
                              ? m
                              : m.text || m.message || ""}
                          </Text>
                        </View>
                      ))
                    : null}
                  {["cancelled", "completed"].includes(trip.status) ? (
                    <Button
                      title="Pedir otro viaje"
                      onPress={() => {
                        setTrip(null);
                        setDestination(null);
                        setQuote(null);
                        setSimulation(-1);
                        setError("");
                        void api
                          .trips()
                          .then(setHistory)
                          .catch(() => {});
                      }}
                    />
                  ) : simulation >= 0 ? (
                    <View style={s.message}>
                      <Icon name="message-circle" size={18} />
                      <Text style={s.messageText}>
                        {simDone
                          ? "Llegaste al destino. ¡Gracias por probar BariGo!"
                          : simulation < 3
                            ? "Mensaje automático: recibimos tu solicitud."
                            : simulation < 6
                              ? "Mensaje automático: el conductor demo está llegando."
                              : "Mensaje automático: viaje de prueba iniciado."}
                      </Text>
                    </View>
                  ) : (
                    <Button
                      title="Ver simulación"
                      secondary
                      onPress={() => setSimulation(0)}
                    />
                  )}
                  {!["cancelled", "completed"].includes(trip.status) ? (
                    <Pressable
                      style={s.textButton}
                      onPress={() => setCancelConfirm(true)}
                    >
                      <Text style={s.cancelText}>Cancelar solicitud</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : quote && destination ? (
                <View style={s.quoteCard}>
                  <View style={s.sectionRow}>
                    <View>
                      <Text style={s.eyebrow}>TU VIAJE</Text>
                      <Text style={s.cardTitle}>BariGo Esencial</Text>
                    </View>
                    <View style={s.carIcon}>
                      <Icon name="truck" size={26} />
                    </View>
                  </View>
                  <View style={s.sectionRow}>
                    <Text style={s.subtitle}>Sedán · hasta 4 pasajeros</Text>
                    <Text style={s.price}>{money(quote.estimate.amount)}</Text>
                  </View>
                  <View style={s.routeMeta}>
                    <Icon name="map" size={15} />
                    <Text style={s.miniText}>
                      {(quote.route.distanceMeters / 1000).toFixed(1)} km
                    </Text>
                    <View style={s.smallDot} />
                    <Text style={s.miniText}>
                      {Math.ceil(quote.route.durationSeconds / 60)} min de
                      recorrido
                    </Text>
                  </View>
                  <Text style={s.paymentLabel}>¿Cómo preferís pagar?</Text>
                  <View style={s.payments}>
                    {[
                      ["cash", "Efectivo", "dollar-sign"],
                      ["transfer", "Transferencia", "smartphone"],
                    ].map(([id, label, icon]) => (
                      <Pressable
                        key={id}
                        onPress={() => setPayment(id)}
                        style={[s.payOption, payment === id && s.paySelected]}
                      >
                        <Icon name={icon as IconName} size={17} />
                        <Text style={s.payText}>{label}</Text>
                        {payment === id ? (
                          <Icon name="check" size={14} />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                  <Text style={s.note}>
                    Estimación en ARS. El pago se acuerda con el conductor; esta
                    demo no cobra.
                  </Text>
                  <Button
                    title="Revisar solicitud"
                    onPress={() => setConfirm(true)}
                  />
                </View>
              ) : !busy ? (
                <>
                  <View style={s.sectionRow}>
                    <Text style={s.sectionTitle}>Tu ciudad, más cerca</Text>
                    <Text style={s.miniText}>EXPLORÁ</Text>
                  </View>
                  <View style={s.suggestions}>
                    {places
                      .filter((p) => p.id !== pickup.id)
                      .slice(0, 3)
                      .map((p, i) => (
                        <Pressable
                          key={p.id}
                          style={s.suggestion}
                          onPress={() => {
                            if (!canChange()) return;
                            setDestination(p);
                            void estimate(pickup, p);
                          }}
                        >
                          <View style={s.suggestionIcon}>
                            <Icon
                              name={
                                i === 0 ? "coffee" : i === 1 ? "sun" : "map-pin"
                              }
                              size={21}
                            />
                          </View>
                          <Text numberOfLines={2} style={s.suggestionTitle}>
                            {p.label}
                          </Text>
                          <Text numberOfLines={1} style={s.miniText}>
                            Ir para allá ↗
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                  <View style={s.promise}>
                    <Icon name="heart" size={20} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.promiseTitle}>
                        De Bariloche, para Bariloche.
                      </Text>
                      <Text style={s.promiseText}>
                        Conectamos los lugares de todos los días.
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
            </>
          ) : tab === "Actividad" ? (
            <>
              <Text style={s.eyebrow}>TUS RECORRIDOS</Text>
              <View style={s.sectionRow}>
                <Text style={s.title}>Actividad</Text>
                <Pressable onPress={refresh}>
                  <Icon name="refresh-cw" />
                </Pressable>
              </View>
              <Text style={s.subtitle}>
                Tus solicitudes de prueba, en un solo lugar.
              </Text>
              {error ? <Text style={s.errorText}>{error}</Text> : null}
              {busy ? <ActivityIndicator /> : null}
              {history.length ? (
                history.map((t: any) => (
                  <View key={t.id} style={s.historyCard}>
                    <View style={s.sectionRow}>
                      <View style={s.suggestionIcon}>
                        <Icon name="navigation" />
                      </View>
                      <Text style={s.badge}>
                        {t.status === "cancelled" ? "CANCELADO" : "DEMO"}
                      </Text>
                    </View>
                    <Text style={s.cardTitle}>
                      {t.destination?.label || "Viaje BariGo"}
                    </Text>
                    <Text style={s.subtitle}>
                      Desde {t.pickup?.label || "Bariloche"}
                    </Text>
                    <View style={[s.sectionRow, { marginTop: 14 }]}>
                      <Text style={s.miniText}>
                        {t.createdAt
                          ? new Date(t.createdAt).toLocaleDateString("es-AR")
                          : "Hoy"}
                      </Text>
                      <Text style={s.historyPrice}>
                        {money(t.estimate?.amount || 0)}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={s.empty}>
                  <Icon name="compass" size={40} />
                  <Text style={s.cardTitle}>El primer viaje te espera</Text>
                  <Text style={s.subtitle}>
                    Cuando solicites un viaje de prueba, lo vas a encontrar acá.
                  </Text>
                  <Button
                    title="Elegir destino"
                    onPress={() => setTab("Inicio")}
                  />
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={s.eyebrow}>TU ESPACIO EN BARIGO</Text>
              <Text style={s.title}>Cuenta</Text>
              <View style={s.profile}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={s.cardTitle}>{name}</Text>
                <Text style={s.subtitle}>
                  Pasajero · cuenta de demostración
                </Text>
                <Pressable
                  style={s.textButton}
                  onPress={() => {
                    setEditName(name);
                    setEdit(true);
                  }}
                >
                  <Text style={s.link}>Editar nombre</Text>
                </Pressable>
              </View>
              <View style={s.infoCard}>
                <Icon name="shield" />
                <View style={{ flex: 1 }}>
                  <Text style={s.promiseTitle}>
                    Tu privacidad viaja con vos
                  </Text>
                  <Text style={s.promiseText}>
                    No mostramos datos de contacto en el perfil público.
                  </Text>
                </View>
              </View>
              <View style={s.infoCard}>
                <Icon name="map-pin" />
                <View style={{ flex: 1 }}>
                  <Text style={s.promiseTitle}>Nuestra zona</Text>
                  <Text style={s.promiseText}>
                    San Carlos de Bariloche y alrededores.
                  </Text>
                </View>
              </View>
              <View style={s.demoBox}>
                <Text style={s.eyebrow}>VERSIÓN DE DESARROLLO</Text>
                <Text style={s.promiseText}>
                  Esta app permite probar el flujo de viaje. No hay conductores
                  reales ni cobros integrados.
                </Text>
                <Text selectable style={s.endpoint}>
                  Servidor: {API_URL}
                </Text>
              </View>
            </>
          )}
          <Text style={s.footer}>BARIGO · EL SUR NOS MUEVE</Text>
        </ScrollView>
        <View style={s.nav}>
          {[
            ["Inicio", "compass"],
            ["Actividad", "clock"],
            ["Cuenta", "user"],
          ].map(([label, icon]) => (
            <Pressable
              key={label}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === label }}
              style={s.navItem}
              onPress={() => {
                setTab(label);
                setError("");
                if (label === "Actividad") void refresh();
              }}
            >
              <View style={[s.navIcon, tab === label && s.navActive]}>
                <Icon name={icon as IconName} size={21} />
              </View>
              <Text
                style={[
                  s.navLabel,
                  tab === label && { color: c.forest, fontWeight: "700" },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Modal
        visible={!!search}
        animationType="slide"
        onRequestClose={() => setSearch(null)}
      >
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalContent}>
            <View style={s.sectionRow}>
              <Text style={s.cardTitle}>
                {search === "pickup" ? "¿De dónde salís?" : "¿A dónde vamos?"}
              </Text>
              <Pressable
                accessibilityLabel="Cerrar búsqueda"
                onPress={() => setSearch(null)}
              >
                <Icon name="x" />
              </Pressable>
            </View>
            <View style={s.searchBox}>
              <Icon name="search" />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Calle y número, clínica o comercio"
                placeholderTextColor={c.muted}
                style={s.searchInput}
              />
              {query ? (
                <Pressable onPress={() => setQuery("")}>
                  <Icon name="x" size={17} />
                </Pressable>
              ) : null}
            </View>
            <Text style={s.note}>
              Buscá una dirección, clínica, comercio o lugar registrado en el
              mapa de Bariloche. Escribí al menos 3 caracteres para consultar.
            </Text>
            {query.trim().length < 3 ? (
              <Text style={s.eyebrow}>LUGARES SUGERIDOS</Text>
            ) : null}
            {searchBusy ? (
              <View style={s.loading}>
                <ActivityIndicator color={c.forest} />
                <Text style={s.subtitle}>Buscando direcciones y lugares…</Text>
              </View>
            ) : null}
            {searchWarning ? (
              <Text style={[s.note, { color: c.danger }]}>{searchWarning}</Text>
            ) : null}
            {searchError ? (
              <Text style={s.errorText}>{searchError}</Text>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled">
              {matches.map((p) => (
                <Pressable
                  key={p.id}
                  style={s.result}
                  onPress={() => select(p)}
                >
                  <View style={s.suggestionIcon}>
                    <Icon name="map-pin" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultTitle}>{p.label}</Text>
                    <Text style={s.subtitle}>{p.detail}</Text>
                    {(p as any).precision === "street" ? (
                      <Text style={s.approximate}>
                        Ubicación aproximada de la calle · no incluye altura
                        exacta
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="arrow-up-left" size={17} />
                </Pressable>
              ))}
              {!matches.length && !searchBusy && !searchError ? (
                <Text style={s.subtitle}>
                  No encontramos esa dirección o lugar. Probá con el nombre
                  completo o un punto de referencia cercano. La cobertura
                  depende de los datos registrados en el mapa.
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        transparent
        visible={confirm || cancelConfirm || edit}
        animationType="fade"
        onRequestClose={() => {
          setConfirm(false);
          setCancelConfirm(false);
          setEdit(false);
        }}
      >
        <View style={s.scrim}>
          <View style={s.dialog}>
            <Text style={s.eyebrow}>
              {edit
                ? "TU PERFIL"
                : cancelConfirm
                  ? "CANCELAR VIAJE"
                  : "ANTES DE SALIR"}
            </Text>
            <Text style={s.cardTitle}>
              {edit
                ? "¿Cómo te llamás?"
                : cancelConfirm
                  ? "¿Cancelamos la solicitud?"
                  : "Revisá tu solicitud"}
            </Text>
            {edit ? (
              <TextInput
                accessibilityLabel="Nombre"
                style={s.nameInput}
                value={editName}
                onChangeText={setEditName}
                maxLength={40}
              />
            ) : cancelConfirm ? (
              <Text style={s.subtitle}>
                La solicitud se cerrará. Podés empezar otra cuando quieras.
              </Text>
            ) : (
              <>
                <Text style={s.dialogRoute}>
                  {pickup.label} → {destination?.label}
                </Text>
                <Text style={s.subtitle}>
                  {money(quote?.estimate?.amount)} ARS estimados ·{" "}
                  {payment === "cash" ? "Efectivo" : "Transferencia"}
                </Text>
                <Text style={s.note}>
                  Modo demo. No se asignará un conductor real ni se realizará un
                  cobro.
                </Text>
              </>
            )}
            <Button
              title={
                edit
                  ? "Guardar nombre"
                  : cancelConfirm
                    ? "Sí, cancelar"
                    : "Confirmar solicitud demo"
              }
              loading={busy}
              disabled={edit && !editName.trim()}
              onPress={
                edit
                  ? async () => {
                      setBusy(true);
                      try {
                        await api.updateName(editName.trim());
                        setName(editName.trim());
                        setEdit(false);
                      } catch {
                        setError("No pudimos guardar tu nombre.");
                        setEdit(false);
                      } finally {
                        setBusy(false);
                      }
                    }
                  : cancelConfirm
                    ? cancel
                    : request
              }
            />
            <Pressable
              style={s.textButton}
              onPress={() => {
                setConfirm(false);
                setCancelConfirm(false);
                setEdit(false);
              }}
            >
              <Text style={s.link}>
                {cancelConfirm ? "Seguir con el viaje" : "Volver"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  approximate: { fontSize: 10, lineHeight: 16, color: c.danger, marginTop: 5 },
  safe: { flex: 1, backgroundColor: c.bg },
  shell: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    flex: 1,
    backgroundColor: c.bg,
  },
  content: { padding: 22, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: {
    width: 34,
    height: 34,
    backgroundColor: c.forest,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1.5,
    color: c.forest,
  },
  locality: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#588061" },
  localityText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: c.forest,
  },
  intro: { marginBottom: 24 },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.7,
    color: "#5F7867",
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1.5,
    lineHeight: 37,
    color: c.forest,
    marginBottom: 10,
  },
  subtitle: { fontSize: 12, lineHeight: 19, color: c.muted },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  category: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: c.lime,
    borderRadius: 22,
  },
  categoryPlain: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryText: { fontSize: 11, fontWeight: "700", color: c.forest },
  miniText: { fontSize: 9, color: c.muted, lineHeight: 15 },
  form: {
    backgroundColor: c.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: c.line,
    marginBottom: 18,
  },
  fieldRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  field: { flex: 1, paddingVertical: 9 },
  fieldLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: c.muted,
    marginBottom: 5,
  },
  fieldValue: { fontSize: 14, fontWeight: "600", color: c.ink },
  originDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: c.forest,
  },
  destinationDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: c.forest,
  },
  formDivider: { height: 1, marginLeft: 23, backgroundColor: c.line },
  location: {
    width: 44,
    height: 44,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  mapCard: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#DCE5D4",
    height: 240,
    marginBottom: 24,
  },
  mapBadge: {
    position: "absolute",
    bottom: 13,
    left: 13,
    backgroundColor: c.white,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  mapBadgeText: { fontSize: 9, fontWeight: "600", color: c.forest },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: c.forest,
  },
  suggestions: { flexDirection: "row", gap: 9, marginTop: 15 },
  suggestion: {
    flex: 1,
    minWidth: 0,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 17,
    padding: 11,
    minHeight: 127,
  },
  suggestionIcon: {
    width: 37,
    height: 37,
    borderRadius: 13,
    backgroundColor: c.sand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  suggestionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: c.forest,
    lineHeight: 16,
    minHeight: 32,
    marginBottom: 5,
  },
  promise: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 22,
  },
  promiseTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: c.forest,
    marginBottom: 4,
  },
  promiseText: { fontSize: 11, lineHeight: 18, color: c.muted },
  footer: {
    fontSize: 8,
    letterSpacing: 2,
    color: "#92A08E",
    textAlign: "center",
    marginTop: 23,
    marginBottom: 8,
  },
  nav: {
    flexDirection: "row",
    backgroundColor: c.white,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 9,
    paddingBottom: 9,
  },
  navItem: { minHeight: 48, flex: 1, alignItems: "center", gap: 3 },
  navIcon: {
    width: 55,
    height: 29,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  navActive: { backgroundColor: c.lime },
  navLabel: { fontSize: 9, color: c.muted },
  quoteCard: {
    backgroundColor: c.white,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.line,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.7,
    color: c.forest,
    marginBottom: 7,
  },
  carIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: c.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  price: {
    fontSize: 25,
    fontWeight: "800",
    color: c.forest,
    letterSpacing: -1,
  },
  routeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 20,
  },
  smallDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: c.muted },
  paymentLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: c.forest,
    marginBottom: 10,
  },
  payments: { flexDirection: "row", gap: 7 },
  payOption: {
    flex: 1,
    padding: 10,
    gap: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
  },
  paySelected: { borderColor: c.forest, backgroundColor: "#F2F7E8" },
  payText: { fontSize: 10, fontWeight: "600", color: c.forest },
  note: { fontSize: 10, lineHeight: 16, color: c.muted, marginVertical: 13 },
  button: {
    backgroundColor: c.forest,
    minHeight: 51,
    borderRadius: 15,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  secondary: { backgroundColor: c.lime, marginTop: 15 },
  buttonText: {
    fontSize: 13,
    fontWeight: "700",
    color: c.white,
    flexShrink: 1,
  },
  loading: { gap: 10, alignItems: "center", padding: 20 },
  error: {
    flexDirection: "row",
    gap: 9,
    backgroundColor: "#FBECE6",
    padding: 13,
    borderRadius: 12,
    marginBottom: 15,
  },
  errorText: { color: c.danger, fontSize: 12, lineHeight: 19, flex: 1 },
  tripCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.line,
  },
  message: {
    padding: 13,
    backgroundColor: c.sand,
    marginTop: 14,
    borderRadius: 12,
    flexDirection: "row",
    gap: 9,
  },
  messageText: { fontSize: 11, lineHeight: 17, color: c.forest, flex: 1 },
  textButton: { alignItems: "center", padding: 15 },
  cancelText: { fontSize: 12, color: c.danger, fontWeight: "600" },
  historyCard: {
    padding: 18,
    backgroundColor: c.white,
    borderRadius: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: c.line,
  },
  badge: {
    fontSize: 9,
    color: c.forest,
    fontWeight: "700",
    backgroundColor: c.sand,
    padding: 7,
    borderRadius: 8,
  },
  historyPrice: { fontSize: 16, color: c.forest, fontWeight: "700" },
  empty: {
    padding: 24,
    marginTop: 25,
    gap: 15,
    backgroundColor: c.white,
    borderRadius: 20,
  },
  profile: {
    padding: 25,
    alignItems: "center",
    backgroundColor: c.white,
    borderRadius: 22,
    marginTop: 20,
    marginBottom: 20,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: c.lime,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: { fontSize: 30, color: c.forest, fontWeight: "800" },
  link: { fontSize: 12, fontWeight: "700", color: c.forest },
  infoCard: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  demoBox: {
    marginTop: 25,
    padding: 17,
    backgroundColor: c.sand,
    borderRadius: 15,
  },
  endpoint: { fontSize: 9, color: c.muted, marginTop: 12 },
  modalSafe: { flex: 1, backgroundColor: c.bg },
  modalContent: {
    padding: 22,
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  searchBox: {
    marginTop: 20,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.line,
  },
  searchInput: {
    minHeight: 54,
    flex: 1,
    fontSize: 14,
    color: c.forest,
    outlineWidth: 0,
  } as any,
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    paddingVertical: 13,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: c.forest,
    marginBottom: 3,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(9,34,28,.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    padding: 24,
    backgroundColor: c.bg,
    borderRadius: 25,
  },
  dialogRoute: {
    fontSize: 15,
    lineHeight: 23,
    color: c.forest,
    marginVertical: 12,
    fontWeight: "600",
  },
  nameInput: {
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.white,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: c.forest,
    marginVertical: 18,
  },
});
