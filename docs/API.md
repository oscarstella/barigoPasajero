# BariGo API inicial

Backend Express, SQLite persistente y reloj de servidor. Node.js **24 o posterior** obligatorio (`node:sqlite`). Es una base de desarrollo con identidades demo, no un servicio listo para transporte comercial ni un sistema de cobro real.

## Ejecutar

Desde `server/`:

```powershell
npm install
Copy-Item .env.example .env
npm start
npm test
```

Los scripts cargan `.env` automáticamente. El servidor escucha `0.0.0.0:3001` para probar desde Expo Go en la misma red. La base queda en `server/data/barigo.sqlite` si se inicia en esa carpeta. `.env` y `data/` no se versionan. No publicar ese puerto en Internet en modo demo. CORS sólo permite los orígenes web listados en `CORS_ORIGINS`; clientes nativos sin Origin son admitidos. Límite de desarrollo 180 solicitudes por IP por minuto. Para producción usar HTTPS, proveedor de identidad real, configuración de proxy explícita, observabilidad, backups, migraciones y límites distribuidos.

`ENABLE_DEMO_AUTH=true` habilita las herramientas de prueba sólo fuera de `NODE_ENV=production`. Deshabilitado, tampoco se admiten sesiones demo previas. Todavía no existe autenticación de producción.

## Contrato

Las rutas salvo salud/config/lugares/login requieren `Authorization: Bearer <token>`. Token opaco aleatorio, hash en base, vigencia 24 h. No contiene contraseña ni se usa el login de Uber.

| Método / ruta                         | Cuerpo o resultado                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET `/api/health`                     | `{ok,service,demoAuth}`                                                                                     |
| GET `/api/config`                     | `{pricing,pass:{usageHours:12,validityHours:24,pausable:true},serviceArea,demo}`                            |
| POST `/api/auth/demo`                 | `{name,role:'passenger'\|'driver'}` → `{token,user,expiresAt,demo:true}`                                    |
| PATCH `/api/me`                       | `{name}` → `{user}` conserva identidad e historial                                                          |
| GET `/api/places?q=Mitre`             | `{places,source,warning?}`                                                                                  |
| POST `/api/estimates`                 | `{pickup,destination}` → `{route,estimate}`                                                                 |
| POST `/api/trips`                     | `{requestId,pickup,destination,payment:'cash'\|'transfer',confirmedEstimate?:{currency,amount}}` → `{trip}` |
| GET `/api/trips`                      | `{trips}` del pasajero o conductor autenticado                                                              |
| GET `/api/trips/:id`                  | `{trip}` sólo participantes                                                                                 |
| POST `/api/trips/:id/cancel`          | Cancela antes de iniciar; conserva registro e historial                                                     |
| GET `/api/trips/:id/events?token=...` | SSE, `event: trip`, `data: {trip}`; snapshot inicial y cambios reales                                       |
| GET `/api/driver/available-trips`     | Sólo conductor con pase activo; `{trips}` pendientes                                                        |
| POST `/api/trips/:id/accept`          | Sólo conductor con pase activo; asignación transaccional                                                    |
| POST `/api/trips/:id/status`          | `{status}`: `arriving`, `arrived`, `in_progress`, `completed`                                               |
| POST `/api/trips/:id/location`        | `{lat,lng}`; sólo conductor asignado, viaje vigente                                                         |
| GET `/api/trips/:id/pickup-route`     | Sólo conductor asignado; requiere ubicación previa, ruta OSRM al origen                                     |
| GET `/api/passes/current`             | `{pass}` o `null`, sólo conductor                                                                           |
| POST `/api/passes/demo-purchase`      | `{requestId,acceptDemo:true,currency:'ARS',amount:7500}`                                                    |
| POST `/api/passes/activate`           | Activa consumo de tiempo                                                                                    |
| POST `/api/passes/pause`              | Pausa consumo, mantiene vencimiento original                                                                |
| PATCH `/api/admin/config`             | Header `X-Admin-Secret`, campos `passAmount`, `passCurrency:'ARS'`, `baseFare`, `perKm`, `perMinute`        |

`requestId` obligatorio para solicitudes y compras: 8–100 letras, números, guiones o `_`, generado una vez por intento y reutilizado ante errores de red. Repetir una compra o solicitud con la misma clave devuelve la operación original. Una solicitud adicional con otra clave devuelve 409 si el pasajero tiene un viaje en curso. La aceptación se resuelve atómicamente y un conductor sólo puede tener un viaje en curso.

Cada punto: `{label,lat,lng}`. Validación amplia de servicio: latitud −41.65 a −40.65; longitud −72 a −70.65. Esta caja no representa aún un polígono operativo validado. La búsqueda usa una caja más acotada que abarca el núcleo de Bariloche y Dina Huapi.

`trip`: `{id,userId,driverId,status,pickup,destination,route,estimate,payment,messages,createdAt,updatedAt,driver?,driverLocation?}`. `driverLocation` contiene coordenadas y `at` del servidor. Mensajes automáticos persistidos al solicitar, aceptar, dirigirse al origen, llegar, iniciar, terminar y cancelar. Son avisos internos del viaje, no SMS ni WhatsApp. No hay asignación automática ni movimiento simulado dentro del backend.

El token por query en SSE es una facilidad de cliente demo: evitar registrar URLs con tokens; usar header Authorization cuando la biblioteca lo permita y HTTPS en una implementación pública. Se cierra al vencer la sesión. El cliente puede consultar periódicamente el viaje como alternativa.

## Prueba Oscar y Gustavo

`POST /api/auth/demo` con `{"name":"Oscar","role":"passenger"}` y `{"name":"Gustavo","role":"driver"}` reutiliza IDs persistentes separados entre sesiones y reinicios. Otros nombres crean usuarios independientes. Esto permite probar dos dispositivos. **No es autenticación real:** cualquiera con acceso al servidor demo puede seleccionar esas identidades.

La consola de desarrollo está en `/demo/conductor` sólo con modo demo habilitado. Gustavo debe comprar explícitamente el pase **simulado**, aceptar el importe actual y activarlo antes de consultar/aceptar pedidos. No se otorga crédito ni un pase gratis de forma automática. Esta consola no reemplaza la futura app nativa del conductor.

## Pase y dinero

Precio inicial **ARS 7.500 fijo**, editable por secreto administrativo. No se afirma que sea el cambio actual de USD 5 ni se consulta cotización. `passCurrency` inicial sólo acepta ARS. No hay comisión porcentual sobre viajes. El precio del viaje es orientativo, fórmula inicial editable: base 1800 + 950/km + 80/min, redondeado a ARS 100. No incluye tráfico en vivo. Una cotización confirmada distinta del recálculo devuelve 409: volver a mostrar el valor y confirmar. Se conserva el estimado y el método de pago en el viaje.

La compra demo NO inicia un pago, NO verifica una transferencia, NO cobra una tarjeta y NO debe presentarse como pago exitoso real. Se requiere consentimiento explícito `acceptDemo:true`, moneda e importe vigentes. Si la configuración cambia antes de confirmar, devuelve 409. El precio se guarda una sola vez en el pase. Reintentar la misma compra conserva su precio original aun si cambió la tarifa.

El pase ofrece 12 horas acumuladas de uso; puede pausarse/reanudarse, vence a las 24 horas exactas de compra aunque esté pausado. Reloj y movimientos de ledger viven en SQLite y servidor. Consultar/activar/pausar liquida consumo desde `active_since`; el proceso puede reiniciarse sin regalar tiempo. La pausa sólo detiene consumo, no amplía vencimiento. La aceptación exige pase activo; un viaje ya aceptado puede completarse aunque el pase venza, para no abandonar al pasajero. No hay tarea automática que reescriba cargos históricos.

`ADMIN_SECRET` no tiene valor predeterminado: ruta administrativa deshabilitada sin secreto configurado. No exponerlo en la app pasajero ni en la consola demo. Web Admin y cobro real quedan pendientes.

## Mapas, calles y autocompletado

Recorridos reales OSRM (`OSRM_URL`, por defecto servicio demo público), geometría GeoJSON `[lng,lat]`, distancia, duración e instrucciones de maniobra en español derivadas de sus pasos. Error de proveedor → 503; sin ruta → 422. No se inventa una línea recta ni se simula disponibilidad. Los datos pueden tener errores y las instrucciones no reemplazan una navegación probada y homologada para uso en conducción.

Autocompletado desde 3 caracteres por Photon (`PHOTON_URL`, por defecto demo público), sesgo Bariloche, caja territorial, timeout 6 s, caché 60 s, consultas idénticas concurrentes agrupadas y separación mínima de llamadas. Se combinan calles/alturas/establecimientos de OpenStreetMap con un catálogo local de lugares conocidos. El cliente debe aplicar debounce. La altura sólo aparece cuando el proveedor realmente devuelve `housenumber`; no se interpola ni inventa una dirección. Resultados: `{id,label,detail,address,lat,lng,precision:'address'|'street'|'place',houseNumber?,source}`. Ante fallo externo se devuelven únicamente coincidencias locales **con advertencia**. Siempre permitir verificar el marcador; los datos OSM no garantizan todos los comercios ni todas las alturas.

El Photon demo probado admite `lang=default`, no `lang=es`; se usa default. Referencia: [API Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md). Los [términos del servidor demo](https://github.com/komoot/photon#demo-server) exigen uso razonable y no garantizan disponibilidad. Ni Photon ni OSRM públicos ofrecen un SLA comercial. Para una operación sin cargos de API, autoalojar datos y motores de OpenStreetMap implica servidores, mantenimiento y costos propios. No puede prometerse operación 100% gratuita ilimitada. Mostrar atribución OpenStreetMap en mapas/resultados.

## Validación automatizada

`npm test`: pruebas de reloj controlado y HTTP real local, sin depender de Internet: consumo/pausa/vencimiento, agotamiento e idempotencia, preservación de tarifa, permisos por usuario y rol, estados válidos, ubicación del conductor, expiración de sesión, identidades demo, consentimiento frente a tarifa cambiante, configuración protegida, CORS, errores OSRM y precisión/caché/fallback Photon. No certifica pagos, seguridad de producción ni navegación en campo.

Un origen GPS puede incluir source=GPS (valor de API: 'gps'), accuracyMeters de 0 a 10000 y locationTimestamp ISO. Se conservan en el viaje para que el conductor conozca la precisión reportada por el dispositivo. El servidor valida formato, no certifica la autenticidad del GPS. La ubicación queda accesible sólo a participantes del viaje; las solicitudes disponibles para conductores activos incluyen el punto de encuentro. El pasajero debe revisar el marcador antes de confirmar.
