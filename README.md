# BariGo Pasajero

Aplicación Android de viajes para Bariloche y alrededores, hecha con React Native, TypeScript y Expo SDK 58. Diseño propio: bosque, lima y tonos naturales. Backend Node.js 24 + Express + SQLite.

## Probar en Expo Go

Requiere Node.js 24 LTS y Expo Go compatible con SDK 58 en Android. Al 17/10/2026, Expo Go 58 todavía no está en Google Play: la app de la tienda puede indicar que debe actualizarse aunque no exista actualización. Usar el APK oficial indicado por `npx expo-go url android 58`, también disponible para el emulador de Android Studio. Esto no demuestra que el teléfono sea viejo.

```sh
npm ci
npm --prefix server ci
npm run api:demo
```

En otra terminal, dentro del mismo proyecto:

```sh
# Copiá .env.example a .env.local y cambiá la IP por la de tu PC
npm start -- --go --lan
```

- `EXPO_PUBLIC_API_URL=http://IP_DE_TU_PC:3001`; en el teléfono `localhost` apunta al teléfono, no a la PC.
- PC y Android en el mismo Wi-Fi. Permití Node en las redes privadas cuando Windows lo pida.
- Escaneá el QR de Expo con Expo Go. `npm run qr` genera también `artifacts/expo-go-qr.png` para el puerto 8081; `BARIGO_HOST` permite elegir la IP si hay varias interfaces.
- La ubicación se solicita sólo al pulsar el botón de ubicación, mientras se usa la app. No se pide GPS en segundo plano.
- Un túnel de Expo no expone automáticamente el backend; con redes distintas necesitás además una URL HTTPS accesible para la API.

## Usuarios de prueba

**Oscar:** pasajero predeterminado, sin contraseña en el modo demo local.

**Gustavo:** conductor de prueba. Abrí `http://IP_DE_TU_PC:3001/demo/conductor` desde un navegador. Simulá explícitamente la compra del pase, activalo, buscá la solicitud de Oscar y aceptala. Los botones permiten avanzar estados y enviar posiciones GPS simuladas. La app del pasajero recibe los cambios por consulta periódica; la API además ofrece SSE.

No se cobran pases ni viajes. No se registran conductores reales. La consola de Gustavo es una herramienta de desarrollo; la aplicación Android del conductor es una próxima entrega.

## Incluido

- Origen/destino con sugerencias locales y autocompletado online de calles, alturas y lugares presentes en OpenStreetMap/Photon, acotado a la zona.
- Resultados sin altura identificados como ubicaciones aproximadas. No se inventan números ni coordenadas de domicilios.
- Mapa Leaflet incluido localmente, teselas OpenStreetMap con atribución visible y proveedor configurable.
- Recorrido real por calles con OSRM, distancia, duración e instrucciones. Sin tráfico en vivo.
- Tarifa estimativa en ARS, selección de efectivo/transferencia y confirmación antes de solicitar. El pago no está integrado.
- Persistencia de solicitudes e historial, cancelación confirmada, estados, mensajes automáticos y seguimiento de posiciones del conductor de prueba.
- Pase de conductor de **12 horas de uso acumulado**, pausable, que **vence a las 24 horas desde la compra**. Precio inicial **ARS 7.500**, configurable. Sin comisión por viaje.
- API administrativa de tarifas, protegida mediante secreto configurado en el entorno, sin credenciales predeterminadas. Panel web administrativo pendiente.

## Mapas y búsqueda

El software y los datos abiertos permiten evitar licencias por viaje. Los servicios públicos de teselas, Photon y OSRM se usan para desarrollo y tienen políticas/límites; no constituyen alojamiento comercial gratuito garantizado. Para producción, desplegar proveedores propios o contratar infraestructura compatible. El servidor acepta `OSRM_URL` y `PHOTON_URL`; el cliente acepta `EXPO_PUBLIC_TILE_URL`.

No se usa el servidor público de Nominatim para autocompletar. La cobertura de domicilios, alturas, clínicas y negocios depende de los datos abiertos: no es un padrón municipal ni garantiza todos los comercios.

El pase usa un importe fijo configurable en pesos; ARS 7.500 no se afirma como una conversión vigente de USD 5. La fuente de cambio, frecuencia de actualización y cobro real quedan por definir.

## Verificación

```sh
npm run typecheck
npm run test:api
npm run export:android
npm run export:web
# Con backend y Expo web en ejecución; Chrome instalado:
npm run test:web
```

Pruebas de API: propiedad de viajes, roles, transiciones, consentimiento, idempotencia y reloj del pase. Pruebas web: pantallas a 320/390/1280 px, teselas decodificadas en el navegador, solicitud por calles, restauración del viaje y cancelación. La exportación Android verifica empaquetado, no reemplaza probar en un teléfono.

## Alcance de esta primera entrega

Es un MVP de desarrollo del pasajero. Quedan por implementar para operar: identidad y login seguros de producción, app nativa del conductor y navegación GPS continua hasta el pasajero/destino, panel Admin completo, pagos y conciliación, notificaciones push, validaciones de conductores, reglas de cancelación/cobertura y despliegue HTTPS. El login demo se desactiva en producción.

La investigación con REA y sus límites están en [docs/REA.md](docs/REA.md). El contrato del servidor está en [docs/API.md](docs/API.md).
