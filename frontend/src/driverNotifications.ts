import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface DriverOrderNotice {
  id: number;
  serviceType: string;
  secondsRemaining: number;
}

const channelId = 'driver-requests';
const actionTypeId = 'driver-request';

const getNotificationId = (orderId: number) => 1_000_000 + orderId;

const progressLine = (secondsRemaining: number) => {
  const progress = Math.max(0, Math.min(1, secondsRemaining / 60));
  const filled = Math.ceil(progress * 12);
  return `${'█'.repeat(filled)}${'░'.repeat(12 - filled)}`;
};

interface ActionableNotificationOptions extends NotificationOptions {
  actions: Array<{ action: string; title: string }>;
  vibrate?: number[];
}

export const requestDriverNotificationPermission = async (): Promise<NotificationPermissionState> => {
  if (Capacitor.isNativePlatform()) {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return permission.display === 'denied' ? 'denied' : 'default';

    let pushPermission = await PushNotifications.checkPermissions();
    if (pushPermission.receive !== 'granted') pushPermission = await PushNotifications.requestPermissions();
    if (pushPermission.receive !== 'granted') {
      return pushPermission.receive === 'denied' ? 'denied' : 'default';
    }

    await LocalNotifications.createChannel({
      id: channelId,
      name: 'Solicitudes de trabajo',
      description: 'Avisos de nuevos trabajos para repartidores',
      importance: 5,
      vibration: true
    });
    await LocalNotifications.registerActionTypes({
      types: [{
        id: actionTypeId,
        actions: [
          { id: 'apply', title: 'Postularme', foreground: true },
          { id: 'ignore', title: 'Ignorar' }
        ]
      }]
    });
    return 'granted';
  }

  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  await navigator.serviceWorker.register('/notifications-sw.js');
  await navigator.serviceWorker.ready;
  return permission;
};

export const getDriverNotificationPermission = async (): Promise<NotificationPermissionState> => {
  if (Capacitor.isNativePlatform()) {
    const [localPermission, pushPermission] = await Promise.all([
      LocalNotifications.checkPermissions(),
      PushNotifications.checkPermissions()
    ]);
    return localPermission.display === 'granted' && pushPermission.receive === 'granted'
      ? 'granted'
      : localPermission.display === 'denied' || pushPermission.receive === 'denied' ? 'denied' : 'default';
  }

  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission;
};

export const showDriverOrderNotification = async (
  order: DriverOrderNotice,
  update = false
): Promise<void> => {
  const seconds = Math.max(0, Math.min(60, order.secondsRemaining));
  const body = `${order.serviceType} disponible · ${seconds}s\n${progressLine(seconds)}`;
  const notificationId = getNotificationId(order.id);

  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [{
        id: notificationId,
        title: 'Nuevo trabajo cerca',
        body,
        largeBody: `${body}\nAbre Llévalo para revisar la ruta y postularte.`,
        channelId,
        actionTypeId,
        silent: update,
        extra: { orderId: order.id, kind: 'driver-request' }
      }]
    });
    return;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  const options: ActionableNotificationOptions = {
    body,
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: `driver_order-${order.id}`,
    silent: update,
    requireInteraction: !update,
    vibrate: update ? undefined : [160, 80, 160],
    actions: [
      { action: 'apply', title: 'Postularme' },
      { action: 'ignore', title: 'Ignorar' }
    ],
    data: { orderId: order.id, kind: 'driver-request' }
  };
  await registration.showNotification('Nuevo trabajo cerca', options);
};

export const showDriverUpdateNotification = async (
  title: string,
  body: string,
  orderId: number
): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [{
        id: 2_000_000 + orderId,
        title,
        body,
        channelId,
        extra: { orderId, kind: 'driver-update' }
      }]
    });
    return;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body,
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: `driver-update-${orderId}`,
    data: { orderId, kind: 'driver-update' }
  });
};

export const clearDriverOrderNotification = async (orderId: number): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    const id = getNotificationId(orderId);
    await LocalNotifications.cancel({ notifications: [{ id }] });
    await LocalNotifications.removeDeliveredNotificationsById({ ids: [id] });
    return;
  }

  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const notifications = await registration.getNotifications();
  notifications
    .filter(notification => {
      const data = notification.data as { orderId?: unknown; kind?: unknown } | undefined;
      return Number(data?.orderId) === orderId
        && (data?.kind === 'driver-request' || data?.kind === 'driver_order');
    })
    .forEach(notification => notification.close());
};

export const clearAllDriverNotifications = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const ids = delivered.notifications
      .map(notification => notification.id)
      .filter(id => id >= 1_000_000 && id < 3_000_000);
    if (ids.length > 0) await LocalNotifications.removeDeliveredNotificationsById({ ids });
    return;
  }

  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const notifications = await registration.getNotifications();
  notifications
    .filter(notification => {
      const data = notification.data as { kind?: unknown } | undefined;
      return data?.kind === 'driver-request'
        || data?.kind === 'driver-update'
        || data?.kind === 'driver_order'
        || data?.kind === 'driver_update';
    })
    .forEach(notification => notification.close());
};
