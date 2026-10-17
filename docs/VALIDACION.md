# Verificación de esta entrega

2026-10-17. Node24, Expo58.

- TypeScript sin errores.
- 9 pruebas de API aprobadas: pase/pausa/consumo/vencimiento/idempotencia/precio histórico, roles/propiedad/estados, sesiones demo, consentimiento y configuración, disponibilidad de rutas, geocodificación y metadatos GPS.
- Pantallas web a 320/390/1280px: sin desbordamiento horizontal ni errores JavaScript; mapa renderizado con teselas decodificadas (naturalWidth >0).
- Teselas realmente recibidas desde esta PC: 92.444B en la vista móvil (4) y136.169B escritorio (6); tamaños por tesela ~16–32KB. No se descargan fotos originales de perfil; los avatares son iniciales dibujadas.
- Ruta real desde esta PC Centro Cívico–Aeropuerto:15.346m,410 coordenadas,22 pasos. Es respuesta OSRM de prueba, no tráfico en vivo.
- Autocompletado vivo: Mitre devuelve calles y negocios con alturas presentes en OSM; Sanatorio devuelve clínicas y direcciones. Photon público no soporta lang=es; se usa default.
- Manifest Expo Go accesible por LAN: hostUri192.168.1.118:8081, runtime exposdk:58.0.0. Falta la prueba del usuario en su teléfono; no se afirma haberla realizado.
- Android y web exportados correctamente. La exportación no reemplaza la validación nativa en un dispositivo.

`npm audit` de la plantilla Expo informa22 alertas transitivas (7 moderadas,15 altas), principalmente herramientas Metro/Expo y node-forge/braces/uuid. Se aplicó la actualización compatible disponible; npm propone bajar a Expo44 para forzar la resolución restante, lo cual rompe este proyecto y no se aplicó. Revisar actualizaciones upstream antes de desplegar producción. No exponer Metro a Internet.

- Flujo de integración Oscar–Gustavo aprobado: GPS simulado con precisión15m, solicitud, aceptación, navegación por calles hasta el punto de partida, estados hasta completar y pausa del pase. No se envían viajes/cobros reales.
