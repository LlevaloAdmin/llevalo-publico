# Contexto técnico de Llévalo

## Producto

Llévalo ofrece dos servicios principales: envíos (comida, mercado, paquetes y mandados) y viajes.
Los usuarios pueden registrarse e iniciar sesión como cliente o repartidor.

## Arquitectura

- Frontend React + Vite + TypeScript, desplegado en Vercel.
- Backend Express + PostgreSQL.
- App móvil Android empaquetada con Capacitor.
- Comunicación HTTP con la API y sincronización periódica de pedidos.
- Mapa interactivo con MapLibre y estilos de OpenFreeMap; búsqueda y geocodificación inversa con Photon sobre datos de OpenStreetMap.
- Mapbox Directions se conserva para calcular rutas; `VITE_MAPBOX_TOKEN` sigue siendo necesario para esa función.

## Estado actual

- Existe autenticación con registro, login y sesión guardada en `localStorage`.
- Los JWT se verifican con HS256, sesión persistida y revocable; el cierre de sesión invalida el token en el backend.
- Login y registro tienen límites de intentos; las acciones administrativas de escritura también se limitan por cuenta.
- El backend añade cabeceras de seguridad, valida orígenes CORS exactos y verifica los certificados TLS de PostgreSQL.
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
- La búsqueda de Photon prioriza San Diego, Carabobo y puede encontrar sectores, calles y establecimientos incluidos en OpenStreetMap. Los resultados incluyen coordenadas para seleccionar con precisión el punto; si falta un lugar, se puede marcar directamente en el mapa y agregar una referencia.
- Photon y OpenFreeMap son servicios públicos sin garantía de disponibilidad; deben usarse razonablemente. Para mayor volumen, conviene alojar Photon o contratar un proveedor con SLA.
- El mapa muestra atribución a OpenStreetMap. Mapbox solo se utiliza para Directions, no como mapa base ni proveedor de búsqueda.

## Build móvil

Cada push a `main` activa GitHub Actions:

1. Compila el frontend.
2. Genera iconos y recursos de Capacitor.
3. Sincroniza Android.
4. Compila el APK debug con Java 21.
5. Sube el APK a Google Drive con nombres autonumerados `llevalo-beta-N.apk`.

La carpeta de destino es administrada mediante el secreto `GOOGLE_DRIVE_FOLDER_ID`.
La autenticación se realiza mediante secretos OAuth almacenados en GitHub Actions.
El código de versión Android se incrementa con el número de ejecución de GitHub Actions. El workflow restaura la firma debug desde el secreto persistente `ANDROID_DEBUG_KEYSTORE_BASE64`; mientras ese secreto no esté configurado, la acción falla explícitamente y no publica APKs incompatibles. Para crear una clave beta una sola vez en PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.android" | Out-Null
keytool -genkeypair -v -keystore "$env:USERPROFILE\.android\llevalo-debug.keystore" -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.android\llevalo-debug.keystore")) | Set-Clipboard
```

Crear en el repositorio de GitHub el secreto `ANDROID_DEBUG_KEYSTORE_BASE64` y pegar el contenido copiado. No subir el keystore al repositorio ni compartir su contenido en el chat. La primera APK con la clave nueva exige desinstalar una vez las APK anteriores firmadas con claves temporales; después las actualizaciones de Actions conservarán la firma.

## Secretos

No guardar credenciales reales en archivos del repositorio.
Configurar las variables de entorno en el servicio correspondiente:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`
- `ANDROID_DEBUG_KEYSTORE_BASE64` (APK beta, firma persistente)
- `JWT_SECRET` (backend, mínimo 32 caracteres aleatorios)
- `CORS_ORIGINS` (backend, lista de orígenes permitidos separados por comas)
- `TRUST_PROXY_HOPS` (opcional; número de proxies inversos confiables para obtener la IP real y aplicar límites por IP)
- `VITE_API_URL` (frontend, URL HTTPS pública del backend)
- `VITE_MAPBOX_TOKEN` (frontend, Directions)

Los secretos de Google Drive y `ANDROID_DEBUG_KEYSTORE_BASE64` pertenecen a GitHub Actions. `JWT_SECRET`, `CORS_ORIGINS` y, si el backend está detrás de un proxy inverso, `TRUST_PROXY_HOPS` se configuran en el backend; `VITE_API_URL` y `VITE_MAPBOX_TOKEN`, en el entorno de compilación del frontend. El backend no inicia si `JWT_SECRET` falta o tiene menos de 32 bytes.

Si algún secreto previo quedó expuesto en historial o texto, debe rotarse en Google Cloud.

## Próximas mejoras

- Reforzar pantalla completa y manejo seguro de áreas de notch.
- Incorporar notificaciones para la revisión de pagos.
- Mantener una navegación clara y consistente entre web y Android.
- Mejorar seguridad, pruebas, estados de pedidos y manejo de errores.
