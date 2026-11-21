import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging, type MulticastMessage } from 'firebase-admin/messaging';
import { pool } from '../db';

type PushPlatform = 'android' | 'web';

interface PushTarget {
  token: string;
  platform: PushPlatform;
}

interface PushEvent {
  kind: 'driver_order' | 'driver_update';
  orderId: number;
  title: string;
  body: string;
  serviceType?: string;
  deadline?: string;
}

let messagingClient: Messaging | null | undefined;
let avisoConfiguracionEmitido = false;
let tablaDispositivosPromise: Promise<void> | null = null;

export const ensurePushTargetsTable = async (): Promise<void> => {
  if (!tablaDispositivosPromise) {
    tablaDispositivosPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_devices (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          platform VARCHAR(10) NOT NULL CHECK (platform IN ('android', 'web')),
          disponible BOOLEAN NOT NULL DEFAULT FALSE,
          creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(
        'ALTER TABLE notification_devices ADD COLUMN IF NOT EXISTS disponible BOOLEAN NOT NULL DEFAULT FALSE'
      );
      await pool.query(
        'CREATE INDEX IF NOT EXISTS notification_devices_user_id_idx ON notification_devices(user_id)'
      );
    })().catch(error => {
      tablaDispositivosPromise = null;
      throw error;
    });
  }
  await tablaDispositivosPromise;
};

const getMessagingClient = (): Messaging | null => {
  if (messagingClient !== undefined) return messagingClient;
  const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!credentialsJson) {
    if (!avisoConfiguracionEmitido) {
      console.warn('Firebase Push está desactivado: falta FIREBASE_SERVICE_ACCOUNT_JSON en el backend.');
      avisoConfiguracionEmitido = true;
    }
    messagingClient = null;
    return messagingClient;
  }

  let credentials: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(credentialsJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('La cuenta de servicio debe ser un objeto JSON.');
    }
    credentials = parsed as Record<string, unknown>;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene un JSON válido.');
  }

  const projectId = credentials.project_id;
  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;
  if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error('La cuenta de servicio de Firebase no contiene los campos requeridos.');
  }

  const account: ServiceAccount = {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n')
  };
  const app = getApps().find(candidate => candidate.name === 'llevalo-push')
    ?? initializeApp({ credential: cert(account), projectId }, 'llevalo-push');
  messagingClient = getMessaging(app);
  return messagingClient;
};

const sendToTargets = async (targets: PushTarget[], event: PushEvent): Promise<void> => {
  const messaging = getMessagingClient();
  if (!messaging || targets.length === 0) return;

  const remainingSeconds = event.deadline
    ? Math.max(1, Math.ceil((Date.parse(event.deadline) - Date.now()) / 1000))
    : undefined;
  const messageData: Record<string, string> = {
    kind: event.kind,
    orderId: String(event.orderId),
    title: event.title,
    body: event.body
  };
  if (event.serviceType) messageData.serviceType = event.serviceType;
  if (event.deadline) messageData.deadline = event.deadline;

  for (let offset = 0; offset < targets.length; offset += 500) {
    const batch = targets.slice(offset, offset + 500);
    const androidTokens = batch.filter(target => target.platform === 'android').map(target => target.token);
    const webTokens = batch.filter(target => target.platform === 'web').map(target => target.token);
    const expiredTokens: string[] = [];

    const send = async (tokens: string[], platform: PushPlatform) => {
      if (tokens.length === 0) return;
      const message: MulticastMessage = platform === 'android'
        ? {
          tokens,
          data: messageData,
          android: {
            priority: 'high',
            ttl: (remainingSeconds ?? 60) * 1000
          }
        }
        : {
          tokens,
          data: messageData,
          webpush: {
            headers: { TTL: String(remainingSeconds ?? 60), Urgency: 'high' }
          }
        };
      const result = await messaging.sendEachForMulticast(message);
      result.responses.forEach((response, index) => {
        if (response.success) return;
        const code = response.error?.code ?? 'unknown';
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          expiredTokens.push(tokens[index]);
        } else {
          console.error(`Firebase Push falló para un dispositivo (${platform}, ${code}).`);
        }
      });
    };

    await Promise.all([
      send(androidTokens, 'android'),
      send(webTokens, 'web')
    ]);

    if (expiredTokens.length > 0) {
      await pool.query(
        'DELETE FROM notification_devices WHERE token = ANY($1::text[])',
        [expiredTokens]
      );
    }
  }
};

export const notifyDriversOfNewOrder = async (pedido: {
  id: number;
  tipo_servicio: string;
  publicado_en: string | Date | null;
}): Promise<void> => {
  if (!pedido.publicado_en) return;
  const deadline = new Date(new Date(pedido.publicado_en).getTime() + 60_000).toISOString();
  const secondsRemaining = Math.ceil((Date.parse(deadline) - Date.now()) / 1000);
  if (secondsRemaining <= 0) return;
  const progress = Math.max(0, Math.min(12, Math.ceil(secondsRemaining / 5)));
  await ensurePushTargetsTable();
  const result = await pool.query(
    `SELECT d.token, d.platform
     FROM notification_devices d
     JOIN usuarios u ON u.id = d.user_id
     WHERE u.rol = 'repartidor' AND d.disponible = TRUE`,
  );
  await sendToTargets(result.rows, {
    kind: 'driver_order',
    orderId: pedido.id,
    title: 'Nuevo trabajo cerca',
    body: `${pedido.tipo_servicio === 'viajes' ? 'Viaje' : 'Envío'} disponible · ${secondsRemaining}s\n${'█'.repeat(progress)}${'░'.repeat(12 - progress)}`,
    serviceType: pedido.tipo_servicio,
    deadline
  });
};

export const notifyDriverOfUpdate = async (
  driverId: number,
  orderId: number,
  title: string,
  body: string
): Promise<void> => {
  await ensurePushTargetsTable();
  const result = await pool.query(
    'SELECT token, platform FROM notification_devices WHERE user_id = $1 AND disponible = TRUE',
    [driverId]
  );
  await sendToTargets(result.rows, {
    kind: 'driver_update',
    orderId,
    title,
    body
  });
};
