# Contexto técnico de Llévalo

## Producto

Llévalo es una aplicación de delivery para pedidos de comida, mercado, mandados y viajes.
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
- Existe chat básico asociado a cada pedido.
- Hay modo claro/oscuro y actualización automática de la tasa oficial de Dólar API.
- La app móvil usa `@capacitor/status-bar` para cubrir el área segura en Android.

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
Usar únicamente GitHub Actions Secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`

Si algún secreto previo quedó expuesto en historial o texto, debe rotarse en Google Cloud.

## Próximas mejoras

- Reforzar pantalla completa y manejo seguro de áreas de notch.
- Crear menús distintos para invitados, clientes y repartidores.
- Mantener una navegación clara y consistente entre web y Android.
- Mejorar seguridad, pruebas, estados de pedidos y manejo de errores.
