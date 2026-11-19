# Contexto técnico de Llévalo

## Producto

Llévalo ofrece dos servicios principales: envíos (comida, mercado, paquetes y mandados) y viajes.
Los usuarios pueden registrarse e iniciar sesión como cliente o repartidor.

## Arquitectura

- Frontend React + Vite + TypeScript, desplegado en Vercel.
- Backend Express + PostgreSQL.
- App móvil Android empaquetada con Capacitor.
- Comunicación HTTP con la API y sincronización periódica de pedidos.
- Mapas de Mapbox con enfoque inicial en San Diego, Carabobo, Venezuela.

## Estado actual

- Existe autenticación con registro, login y sesión guardada en `localStorage`.
- Los clientes pueden publicar pedidos, consultar postulaciones y aceptar repartidores.
- Los repartidores pueden consultar pedidos, postularse, cancelar postulaciones y actualizar ubicación.
- El selector principal agrupa los servicios en Envíos y Viajes; se conservan los tipos históricos para pedidos existentes.
- Los viajes cuestan USD 0,38/km si la ruta es menor de 1 km y USD 0,28/km desde 1 km, con el mínimo vigente de USD 1,50. El backend recalcula y valida la tarifa.
- Los viajes admiten Pago Móvil con verificación manual, efectivo confirmado por el conductor antes de iniciar y saldo corporativo prepagado. Los envíos no requieren pago en la app.
- Un viaje puede cancelarse hasta antes de iniciarse, incluso después de que un conductor lo acepte. Si se pagó con saldo corporativo, el sistema devuelve el monto al saldo; si fue Pago Móvil, queda una devolución pendiente para que el administrador verifique el abono, devuelva el dinero manualmente y confirme la operación.
- El panel de administración permite validar pagos, gestionar devoluciones de Pago Móvil, configurar los datos receptores y recargar saldos corporativos. El permiso se controla con la columna `usuarios.es_admin`.
- No se permite el registro público de administradores. La primera cuenta administradora se habilita manualmente en la base de datos y debe volver a iniciar sesión para recibir el permiso.
- Los cambios de perfil se guardan en la base de datos.
- El chat se mantiene para envíos y se oculta en viajes.
- Hay modo claro/oscuro y actualización automática de la tasa oficial de Dólar API.
- La app móvil usa `@capacitor/status-bar` para cubrir el área segura en Android.
- La interfaz adapta la tipografía y los controles a pantallas estrechas; Android aplica a la WebView la escala de texto configurada en el dispositivo y los formularios reacomodan sus botones en pantallas compactas.
- La búsqueda de direcciones usa Mapbox Geocoding v5 para direcciones, sectores y localidades; si no hay coincidencia, se puede fijar el punto en el mapa y agregar una referencia.
- Geocoding v5 ya no ofrece resultados POI (establecimientos), y Mapbox Search Box no cubre Venezuela; para autocompletar negocios se necesita otro proveedor con cobertura local.

## Build móvil

Cada push a `main` activa GitHub Actions:

1. Compila el frontend.
2. Genera iconos y recursos de Capacitor.
3. Sincroniza Android.
4. Compila el APK debug con Java 21.
5. Sube el APK a Google Drive con nombres autonumerados `llevalo-beta-N.apk`.

La carpeta de destino es administrada mediante el secreto `GOOGLE_DRIVE_FOLDER_ID`.
La autenticación se realiza mediante secretos OAuth almacenados en GitHub Actions.

## Secretos

No guardar credenciales reales en archivos del repositorio.
Configurar las variables de entorno en el servicio correspondiente:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`
- `JWT_SECRET` (backend, mínimo 32 caracteres aleatorios)
- `CORS_ORIGINS` (backend, lista de orígenes permitidos separados por comas)
- `VITE_API_URL` (frontend, URL HTTPS pública del backend)

Los valores de Google Drive pertenecen a GitHub Actions; las demás variables deben
configurarse en el hosting del backend o frontend indicado. El backend no inicia si
`JWT_SECRET` falta o tiene menos de 32 caracteres.

Si algún secreto previo quedó expuesto en historial o texto, debe rotarse en Google Cloud.

## Próximas mejoras

- Reforzar pantalla completa y manejo seguro de áreas de notch.
- Incorporar notificaciones para la revisión de pagos.
- Mantener una navegación clara y consistente entre web y Android.
- Mejorar seguridad, pruebas, estados de pedidos y manejo de errores.
