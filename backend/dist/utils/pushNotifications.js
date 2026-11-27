"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyDriverOfUpdate = exports.notifyAdminsOfPendingPayment = exports.notifyDriversOfNewOrder = exports.ensurePushTargetsTable = void 0;
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const db_1 = require("../db");
const orderCode_1 = require("./orderCode");
let messagingClient;
let avisoConfiguracionEmitido = false;
let tablaDispositivosPromise = null;
const ensurePushTargetsTable = async () => {
    if (!tablaDispositivosPromise) {
        tablaDispositivosPromise = (async () => {
            await db_1.pool.query(`
        CREATE TABLE IF NOT EXISTS notification_devices (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          platform VARCHAR(10) NOT NULL CHECK (platform IN ('android', 'web')),
          disponible BOOLEAN NOT NULL DEFAULT FALSE,
          creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
            await db_1.pool.query('ALTER TABLE notification_devices ADD COLUMN IF NOT EXISTS disponible BOOLEAN NOT NULL DEFAULT FALSE');
            await db_1.pool.query('CREATE INDEX IF NOT EXISTS notification_devices_user_id_idx ON notification_devices(user_id)');
        })().catch(error => {
            tablaDispositivosPromise = null;
            throw error;
        });
    }
    await tablaDispositivosPromise;
};
exports.ensurePushTargetsTable = ensurePushTargetsTable;
const getMessagingClient = () => {
    if (messagingClient !== undefined)
        return messagingClient;
    const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!credentialsJson) {
        if (!avisoConfiguracionEmitido) {
            console.warn('Firebase Push está desactivado: falta FIREBASE_SERVICE_ACCOUNT_JSON en el backend.');
            avisoConfiguracionEmitido = true;
        }
        messagingClient = null;
        return messagingClient;
    }
    let credentials;
    try {
        const parsed = JSON.parse(credentialsJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('La cuenta de servicio debe ser un objeto JSON.');
        }
        credentials = parsed;
    }
    catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene un JSON válido.');
    }
    const projectId = credentials.project_id;
    const clientEmail = credentials.client_email;
    const privateKey = credentials.private_key;
    if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
        throw new Error('La cuenta de servicio de Firebase no contiene los campos requeridos.');
    }
    const account = {
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
    };
    const app = (0, app_1.getApps)().find(candidate => candidate.name === 'llevalo-push')
        ?? (0, app_1.initializeApp)({ credential: (0, app_1.cert)(account), projectId }, 'llevalo-push');
    messagingClient = (0, messaging_1.getMessaging)(app);
    return messagingClient;
};
const sendToTargets = async (targets, event) => {
    const messaging = getMessagingClient();
    if (!messaging || targets.length === 0)
        return;
    const remainingSeconds = event.deadline
        ? Math.max(1, Math.ceil((Date.parse(event.deadline) - Date.now()) / 1000))
        : undefined;
    const ttlSeconds = event.kind === 'admin_payment_pending' ? 604_800 : remainingSeconds ?? 60;
    const messageData = {
        kind: event.kind,
        orderId: String(event.orderId),
        title: event.title,
        body: event.body
    };
    if (event.serviceType)
        messageData.serviceType = event.serviceType;
    if (event.deadline)
        messageData.deadline = event.deadline;
    for (let offset = 0; offset < targets.length; offset += 500) {
        const batch = targets.slice(offset, offset + 500);
        const androidTokens = batch.filter(target => target.platform === 'android').map(target => target.token);
        const webTokens = batch.filter(target => target.platform === 'web').map(target => target.token);
        const expiredTokens = [];
        const send = async (tokens, platform) => {
            if (tokens.length === 0)
                return;
            const message = platform === 'android'
                ? {
                    tokens,
                    data: messageData,
                    android: {
                        priority: 'high',
                        ttl: ttlSeconds * 1000
                    }
                }
                : {
                    tokens,
                    data: messageData,
                    webpush: {
                        headers: { TTL: String(ttlSeconds), Urgency: 'high' }
                    }
                };
            const result = await messaging.sendEachForMulticast(message);
            result.responses.forEach((response, index) => {
                if (response.success)
                    return;
                const code = response.error?.code ?? 'unknown';
                if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
                    expiredTokens.push(tokens[index]);
                }
                else {
                    console.error(`Firebase Push falló para un dispositivo (${platform}, ${code}).`);
                }
            });
        };
        await Promise.all([
            send(androidTokens, 'android'),
            send(webTokens, 'web')
        ]);
        if (expiredTokens.length > 0) {
            await db_1.pool.query('DELETE FROM notification_devices WHERE token = ANY($1::text[])', [expiredTokens]);
        }
    }
};
const notifyDriversOfNewOrder = async (pedido) => {
    if (!pedido.publicado_en)
        return;
    const deadline = new Date(new Date(pedido.publicado_en).getTime() + 60_000).toISOString();
    const secondsRemaining = Math.ceil((Date.parse(deadline) - Date.now()) / 1000);
    if (secondsRemaining <= 0)
        return;
    const progress = Math.max(0, Math.min(12, Math.ceil(secondsRemaining / 5)));
    await (0, exports.ensurePushTargetsTable)();
    const result = await db_1.pool.query(`SELECT d.token, d.platform
     FROM notification_devices d
     JOIN usuarios u ON u.id = d.user_id
     WHERE u.rol = 'repartidor' AND d.disponible = TRUE`);
    await sendToTargets(result.rows, {
        kind: 'driver_order',
        orderId: pedido.id,
        title: 'Nuevo trabajo cerca',
        body: `${pedido.tipo_servicio === 'viajes' ? 'Viaje' : 'Envío'} disponible · ${secondsRemaining}s\n${'█'.repeat(progress)}${'░'.repeat(12 - progress)}`,
        serviceType: pedido.tipo_servicio,
        deadline
    });
};
exports.notifyDriversOfNewOrder = notifyDriversOfNewOrder;
const notifyAdminsOfPendingPayment = async (pedido) => {
    await (0, exports.ensurePushTargetsTable)();
    const result = await db_1.pool.query(`SELECT d.token, d.platform
     FROM notification_devices d
     JOIN usuarios u ON u.id = d.user_id
     WHERE u.es_admin = TRUE AND u.id <> $1`, [pedido.clienteId]);
    await sendToTargets(result.rows, {
        kind: 'admin_payment_pending',
        orderId: pedido.id,
        title: 'Pago móvil por verificar',
        body: `Pedido ${(0, orderCode_1.codigoPedido)(pedido.id)} · Revisa el abono en Banplus.`
    });
};
exports.notifyAdminsOfPendingPayment = notifyAdminsOfPendingPayment;
const notifyDriverOfUpdate = async (driverId, orderId, title, body) => {
    await (0, exports.ensurePushTargetsTable)();
    const result = await db_1.pool.query('SELECT token, platform FROM notification_devices WHERE user_id = $1 AND disponible = TRUE', [driverId]);
    await sendToTargets(result.rows, {
        kind: 'driver_update',
        orderId,
        title,
        body
    });
};
exports.notifyDriverOfUpdate = notifyDriverOfUpdate;
