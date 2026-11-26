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

- Existe autenticación con login y sesión guardada en `localStorage`. El registro de cliente pide correo, teléfono y cédula. La cuenta queda pendiente y no puede iniciar sesión hasta ingresar el código de correo.
- El registro de repartidor crea una postulación, no una cuenta operativa. Tras ingresar el código de correo, solo administración puede aprobarla después de la entrevista presencial; el candidato crea su contraseña con un enlace de un solo uso después de esa aprobación.
- Correo, teléfono y cédula se normalizan y se comprueba que no estén asociados a otra cuenta o postulación activa. El teléfono no se valida por SMS; la cédula del cliente se conserva en su perfil y no se comparte en pedidos públicos.
- El teléfono de cliente no tiene OTP y se marca como no verificado. En la entrevista, administración debe comprobar el número del candidato y revisar cédula y documentos originales; la aprobación registra esa comprobación manual, no una validación automática.
- En esta etapa no se suben ni almacenan fotos de cédula, documentos o vehículo. Los datos de identificación y placa de la postulación solo se muestran en el panel administrativo; en perfiles y pedidos compartidos se limita la información del vehículo al tipo/modelo general.
- Los códigos de confirmación de correo vencen en 10 minutos, solo pueden usarse una vez y permiten hasta cinco intentos; se almacenan como HMAC con la clave del backend. Los enlaces de activación de repartidor vencen en 30 minutos y solo pueden usarse una vez. Los registros de cliente y las postulaciones no confirmadas se eliminan después de 30 días; las postulaciones rechazadas, después de 90 días.
- Los JWT se verifican con HS256, sesión persistida y revocable; el cierre de sesión invalida el token en el backend.
- Login y registro tienen límites de intentos; las acciones administrativas de escritura también se limitan por cuenta.
- El backend añade cabeceras de seguridad, valida orígenes CORS exactos y verifica los certificados TLS de PostgreSQL.
- Los clientes pueden publicar pedidos, consultar postulaciones y aceptar repartidores.
- Los repartidores pueden consultar pedidos, postularse, cancelar postulaciones y actualizar ubicación.
- El selector principal agrupa los servicios en Envíos y Viajes; se conservan los tipos históricos para pedidos existentes.
- Los viajes cuestan USD 0,38/km si la ruta es menor de 1 km y USD 0,28/km desde 1 km, con el mínimo vigente de USD 1,50. El backend recalcula y valida la tarifa.
- Los viajes admiten Pago Móvil con verificación manual y efectivo confirmado por el conductor antes de iniciar. El saldo corporativo ya no se ofrece ni se puede recargar o usar en pedidos nuevos.
- Un viaje puede cancelarse hasta antes de iniciarse, incluso después de que un conductor lo acepte. Si se pagó con Pago Móvil, queda una devolución pendiente para que el administrador verifique el abono, devuelva el dinero manualmente y confirme la operación.
- El panel de administración permite validar pagos, gestionar devoluciones de Pago Móvil y configurar los datos receptores. El permiso se controla con la columna `usuarios.es_admin`.
- Los registros y movimientos históricos del saldo no se borran automáticamente; antes de eliminar esas tablas o cuentas hay que comprobar si quedan fondos y conciliarlos o devolverlos.
- No se permite el registro público de administradores. La primera cuenta administradora se habilita manualmente en la base de datos y debe volver a iniciar sesión para recibir el permiso.
- Los cambios de perfil se guardan en la base de datos.
- El correo de verificación usa Google Apps Script como relay HTTPS hacia Gmail para conservar los códigos numéricos sin comprar un dominio. La cuota publicada de una cuenta Gmail personal es de 100 destinatarios diarios; está sujeta a cambios y no garantiza disponibilidad 24/7. Probar códigos y enlaces de activación en web y Android después de desplegar y configurar el relay.
- El chat se mantiene para envíos y se oculta en viajes.
- Hay modo claro/oscuro y actualización automática de la tasa oficial de Dólar API.
- La app móvil usa `@capacitor/status-bar` para cubrir el área segura en Android.
- La interfaz adapta la tipografía y los controles a pantallas estrechas; Android aplica a la WebView la escala de texto configurada en el dispositivo y los formularios reacomodan sus botones en pantallas compactas.
- La búsqueda de Photon prioriza San Diego, Carabobo y puede encontrar sectores, calles y establecimientos incluidos en OpenStreetMap. Los resultados incluyen coordenadas para seleccionar con precisión el punto; si falta un lugar, se puede marcar directamente en el mapa y agregar una referencia.
- Photon y OpenFreeMap son servicios públicos sin garantía de disponibilidad; deben usarse razonablemente. Para mayor volumen, conviene alojar Photon o contratar un proveedor con SLA.
- El mapa muestra atribución a OpenStreetMap. Mapbox solo se utiliza para Directions, no como mapa base ni proveedor de búsqueda.

## Pagos y automatización Banplus (pendiente)

### Estado y decisión inicial

- Los viajes admiten Pago Móvil con revisión manual y efectivo confirmado por el conductor antes de iniciar; el pago por saldo corporativo fue retirado.
- Para empezar a cobrar viajes, la propuesta es usar Pago Móvil y transferencias directamente a una cuenta receptora de Llévalo, sin crear saldo precargable para clientes. El dinero recibido se concilia por viaje; después de completarlo se registran por separado la comisión de Llévalo y lo que se debe al repartidor.
- No habilitar pagos en efectivo como flujo inicial automatizado: el dinero lo recibe el repartidor, así que Llévalo no puede comprobar el pago bancario y debe conciliar la comisión pendiente. Se puede evaluar más adelante con límites y confirmación de ambas partes.
- No aprobar un pago únicamente por una captura del cliente. El objetivo es que el pedido permanezca pendiente hasta comprobar que el pago fue acreditado; si no hay una integración bancaria verificable, la confirmación debe ser manual.
- Mostrar y registrar el importe en bolívares y la tasa BCV utilizada al cotizar; no recalcular pagos históricos con la tasa actual.
- No crear una billetera recargable de clientes hasta aclarar cómo se reciben, custodian, concilian y reembolsan esos fondos. Quitar la billetera reduce complejidad, pero no determina por sí solo las obligaciones legales o contables del modelo de cobro y liquidación.

### Verificaciones pendientes con Banplus

- Confirmar quién es el titular y cuál es el banco de la cuenta receptora que recibirá los pagos de Llévalo. No asumir que una cuenta personal sirve para cobros comerciales o para liquidar dinero a repartidores.
- Consultar si la cuenta puede afiliarse a Pago Plus Comercio, Merchant o Botón de Pago, o si se requiere una cuenta/producto comercial y Banplus On Line Empresas. La información pública de Banplus menciona esos servicios para comercios, notificaciones y conciliación; Merchant/Botón de Pago contemplan pagos móviles y transferencias, pero no se ha confirmado una API pública ni la elegibilidad de la cuenta disponible.
- Preguntar si Banplus ofrece API, webhook, notificación segura al servidor o integración con un proveedor aliado; solicitar documentación, requisitos, costos, límites y entorno de pruebas.
- Confirmar que la integración entregue un identificador único de transacción, monto, moneda, referencia del pedido y estado final del pago, y permita verificar autenticidad, consultar el estado y conciliar operaciones.
- Los SMS/correos de Pago Plus personal y los comprobantes pueden servir como aviso o referencia, pero no se deben tratar como una API ni como única prueba automática de pago. No automatizar el acceso a Banplus On Line ni almacenar sus credenciales en Llévalo.
- Si Banplus no ofrece una confirmación servidor-a-servidor o canal comercial fiable, iniciar con comprobación manual en el estado de cuenta; una alerta automática no equivale a verificación.
- No prometer que la solución será 100 % gratuita: confirmar cargos bancarios, afiliación, proveedor, conectividad y alojamiento.

### Diseño técnico cuando se confirme el canal

- Crear cada pago asociado a un pedido con monto fijo, identificador único y estado explícito (por ejemplo, pendiente, confirmado, rechazado o reembolsado).
- El backend debe validar el evento directamente con Banplus/proveedor, comprobar monto y referencia, impedir reutilizar una transacción y procesar eventos duplicados de forma idempotente. No confiar solo en una redirección del navegador, SMS o captura.
- Registrar los movimientos con historial auditable; al completar el pedido, separar el importe bruto, la comisión de Llévalo y el monto pendiente de liquidar al repartidor. Los pagos a repartidores pueden empezar con revisión y ejecución manual.
- No habilitar recargas, saldos de clientes ni deudas de repartidores como parte de esta iniciativa sin una decisión explícita y una revisión operativa y legal.

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
- `GMAIL_RELAY_URL` (backend, URL `/exec` de la aplicación web de Google Apps Script)
- `GMAIL_RELAY_SECRET` (backend, secreto compartido con la propiedad `LLEVALO_RELAY_SECRET` del script)
- `FRONTEND_URL` (backend, origen HTTPS de la app al que apuntan los correos; por ejemplo `https://llevalo.vercel.app`)
- `VITE_API_URL` (frontend, URL HTTPS pública del backend)
- `VITE_MAPBOX_TOKEN` (frontend, Directions)

Los secretos de Google Drive y `ANDROID_DEBUG_KEYSTORE_BASE64` pertenecen a GitHub Actions. `JWT_SECRET`, `CORS_ORIGINS`, `GMAIL_RELAY_URL`, `GMAIL_RELAY_SECRET`, `FRONTEND_URL` y, si el backend está detrás de un proxy inverso, `TRUST_PROXY_HOPS` se configuran en el backend; `VITE_API_URL` y `VITE_MAPBOX_TOKEN`, en el entorno de compilación del frontend. No guardar secretos en Vite, Android ni Git. El backend no inicia si `JWT_SECRET` falta o tiene menos de 32 bytes.

### Envío de correos beta

Render Free bloquea SMTP saliente, por lo que la contraseña de aplicación de Gmail no se usa. `backend/scripts/gmail-relay.gs` envía los códigos y avisos mediante `MailApp` en Google Apps Script. Publicar ese script como aplicación web que se ejecuta como el propietario y permite acceso a cualquiera; el endpoint exige un secreto compartido antes de enviar. Configurar `LLEVALO_RELAY_SECRET` en las propiedades del script y el mismo valor, junto con la URL `/exec`, en Render como `GMAIL_RELAY_SECRET` y `GMAIL_RELAY_URL`. Una cuenta Gmail personal tiene una cuota publicada de 100 destinatarios diarios para Apps Script; los límites pueden cambiar y no constituyen una garantía de disponibilidad 24/7.

### Reinicio de datos de la beta

`backend/scripts/reset-beta-data.sql` elimina cuentas, sesiones, postulaciones, pedidos, reseñas, chats, actividad administrativa, registros de pago y tablas antiguas de saldo si existen. Conserva la configuración de tarifas y Pago Móvil. No se ejecuta automáticamente: la base PostgreSQL está en Neon, y el script debe ejecutarse manualmente allí solo después de confirmar el proyecto correcto. Tras el borrado, no queda ninguna cuenta administradora; registrar una cuenta nueva y promoverla manualmente en la base.

Si algún secreto previo quedó expuesto en historial o texto, debe rotarse en Google Cloud.

## Próximas mejoras

- Reforzar pantalla completa y manejo seguro de áreas de notch.
- Incorporar notificaciones para la revisión de pagos.
- Mantener una navegación clara y consistente entre web y Android.
- Elegir almacenamiento privado antes de recibir documentos o fotos de identidad y vehículo; no usar URLs públicas para ese material.
- Acordar retención, consentimiento y acceso administrativo a los datos personales antes de ampliar la revisión de candidatos.
- Definir el porcentaje de comisión y las reglas de jornada antes de implementar historial laboral, ganancias semanales y liquidaciones.
- Mejorar seguridad, pruebas, estados de pedidos y manejo de errores. Ningún sistema puede garantizar ser “inhackeable”; mantener dependencias actualizadas, secretos fuera del repositorio, controles de acceso, respaldos y monitoreo.
