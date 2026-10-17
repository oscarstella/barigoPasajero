export type Place = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  precision?: "address" | "street" | "place";
  houseNumber?: string;
  source?: "gps";
  accuracyMeters?: number;
  locationTimestamp?: string;
};
export const places: Place[] = [
  {
    id: "centro",
    label: "Centro Cívico",
    detail: "Centro · Bariloche",
    lat: -41.13347,
    lng: -71.31028,
  },
  {
    id: "aeropuerto",
    label: "Aeropuerto de Bariloche",
    detail: "Teniente Luis Candelaria · RN 40",
    lat: -41.14557,
    lng: -71.16109,
  },
  {
    id: "terminal",
    label: "Terminal de ómnibus",
    detail: "12 de Octubre 2400 · Bariloche",
    lat: -41.13308,
    lng: -71.2771,
  },
  {
    id: "catedral",
    label: "Cerro Catedral",
    detail: "Base · Villa Catedral",
    lat: -41.16698,
    lng: -71.43855,
  },
  {
    id: "campanario",
    label: "Cerro Campanario",
    detail: "Av. Bustillo km 17,5",
    lat: -41.09053,
    lng: -71.44739,
  },
  {
    id: "llao",
    label: "Hotel Llao Llao",
    detail: "Av. Bustillo km 25 · Llao Llao",
    lat: -41.05784,
    lng: -71.53123,
  },
  {
    id: "playabonita",
    label: "Playa Bonita",
    detail: "Av. Bustillo km 8",
    lat: -41.11954,
    lng: -71.40326,
  },
  {
    id: "melipal",
    label: "Melipal",
    detail: "Av. Bustillo km 4",
    lat: -41.12646,
    lng: -71.3547,
  },
  {
    id: "otto",
    label: "Teleférico Cerro Otto",
    detail: "Av. Pioneros km 5",
    lat: -41.13742,
    lng: -71.36309,
  },
  {
    id: "catedralcentro",
    label: "Catedral Nuestra Señora del Nahuel Huapi",
    detail: "Vice Almte. O’Connor 500",
    lat: -41.13216,
    lng: -71.30105,
  },
  {
    id: "hospital",
    label: "Hospital Zonal Ramón Carrillo",
    detail: "Elflein 623 · Centro",
    lat: -41.1391,
    lng: -71.30171,
  },
  {
    id: "costanera",
    label: "Costanera de Bariloche",
    detail: "Playa del Centro · Nahuel Huapi",
    lat: -41.13169,
    lng: -71.30857,
  },
  {
    id: "colonia",
    label: "Colonia Suiza",
    detail: "Circuito Chico · Alrededores",
    lat: -41.09449,
    lng: -71.50773,
  },
  {
    id: "gutierrez",
    label: "Villa Los Coihues",
    detail: "Lago Gutiérrez · Alrededores",
    lat: -41.17894,
    lng: -71.41128,
  },
  {
    id: "dinahuapi",
    label: "Dina Huapi",
    detail: "Centro · Alrededores",
    lat: -41.07384,
    lng: -71.1619,
  },
  {
    id: "moreno",
    label: "Lago Moreno",
    detail: "Puente · Circuito Chico",
    lat: -41.08055,
    lng: -71.50381,
  },
];
export function insideServiceArea(p: { lat: number; lng: number }) {
  return (
    p.lat >= -41.3 && p.lat <= -40.98 && p.lng >= -71.65 && p.lng <= -71.05
  );
}
