# REA: referencia funcional de la solicitud de viajes

Fecha: 2026-10-17. Objetivo: tomar patrones funcionales para una implementación original de BariGo, con diseño propio.

## Observado con REA

- `ev_cc474275ac5488ef97c7008f0fcbecc6c3f3462bb9ee571dda5397c10f37ab44`: `capture_browser_scenario`, Chrome 155, viewport 390×844, es-AR. El enlace rider-home redirigió a la portada argentina. Se observaron origen/destino, acción de consultar tarifas y contenido público que describe solicitud, aceptación, aviso de llegada, identificación del vehículo y calificación.
- `ev_8693f71f1294033ab221a3e4253b0b898e0d3c33839147965b563c596d8d05d5`: `https://m.uber.com/looking/` redirigió a `/go/home`. Se observaron controles Punto de partida, Destino, hora del viaje, Para mí y un mapa. No hubo sesión autenticada en el perfil temporal.

## Límites

No se solicitó ningún viaje en Uber ni se efectuaron pagos. No se observaron los algoritmos de asignación, tarifas internas, navegación privada o mecanismos de seguridad. El consentimiento para usar la sesión fue recibido, pero no se necesitó usar credenciales para esta primera entrega. El diseño visual, la API, las reglas del pase y las tarifas de BariGo son decisiones propias, no hallazgos internos de Uber.

## Estado de BariGo

Pasajero: catálogo local de puntos de referencia, ubicación foreground, ruta por calles, tarifa estimativa ARS, solicitud con confirmación, historial, cancelación y seguimiento demo del backend. Conductor: consola de pruebas Gustavo, no aplicación Android terminada. Admin: API protegida para configuración, sin panel web terminado. Autenticación real, pagos, verificaciones de conductor, notificaciones push, búsqueda completa de domicilios y GPS de conductor en producción quedan pendientes.
