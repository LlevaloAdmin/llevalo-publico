# Instrucciones permanentes para Copilot

## Proyecto

- Llévalo es una aplicación de delivery para pedidos de comida, mercado, mandados y viajes.
- Es un proyecto dividido en frontend React/Vite, backend Express/PostgreSQL y una app Android con Capacitor.
- Mantén consistencia entre los flujos web y móvil. No modifiques solo la vista web si el cambio también afecta Capacitor.
- Las cuentas de usuario pueden ser `cliente` o `repartidor`.

## Tecnologías y rutas

- Frontend: `frontend/src/App.tsx`, React, TypeScript, Tailwind CSS 4 y Lucide.
- Mapas: Mapbox, con ubicación limitada a San Diego/Carabobo/Venezuela.
- Móvil: `frontend/capacitor.config.ts` y `frontend/android/`.
- Backend: `backend/src/index.ts`, rutas de Express y PostgreSQL mediante `pg`.
- API: variable `VITE_API_URL`; en desarrollo se usa el host actual y el puerto 5000.
- Sesión web: `llevalo_usuario` y `llevalo_token` en `localStorage`.

## Reglas de trabajo

- Haz cambios completos y verifica el resultado con el build más pequeño correspondiente.
- Antes de modificar, busca patrones existentes y reutilízalos.
- Respeta el tema claro/oscuro, el diseño naranja/verde y los componentes existentes.
- Mantén tipos y validaciones claras. No uses `any` salvo que ya exista una integración dinámica.
- No uses `git reset --hard`, `git checkout --` ni elimines archivos sin autorización explícita.
- No cambies la interfaz completa ni rompas flujos existentes sin pedir decisión si no está definida.

## Seguridad

- Nunca escribas secretos, tokens OAuth, contraseñas o valores sensibles dentro del código o este archivo.
- La integración de Google Drive usa secrets de GitHub Actions: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` y `GOOGLE_DRIVE_FOLDER_ID`.
- Si se descubre un secreto en texto plano, indícalo y prepara su sustitución; no lo repitas.

## Validación

- Frontend: `cd frontend && npm run build`.
- Backend: `cd backend && npm run build`.
- Android: `cd frontend && npx cap sync android && cd android && .\\gradlew.bat assembleDebug`.
- Ejecuta primero la validación mínima del área modificada.

## CI/CD

- El workflow `.github/workflows/build-apk.yml` compila en `main`, genera recursos Android y sube el APK a Google Drive con nomenclatura `llevalo-beta-N.apk`.
- No cambies nombres de secrets ni la carpeta de destino sin confirmar.
