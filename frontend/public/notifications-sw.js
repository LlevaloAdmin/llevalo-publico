self.addEventListener('push', event => {
  if (!event.data) return;

  event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data.json();
    } catch (error) {
      console.error('No se pudo leer el mensaje push:', error);
      return;
    }

    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    if (!data || (data.kind !== 'driver_order' && data.kind !== 'driver_update')) return;

    const orderId = Number(data.orderId);
    if (!Number.isSafeInteger(orderId) || orderId < 1) return;

    let body = typeof data.body === 'string' ? data.body : 'Abre Llévalo para revisar la actualización.';
    const isNewOrder = data.kind === 'driver_order';
    if (isNewOrder) {
      const deadline = typeof data.deadline === 'string' ? Date.parse(data.deadline) : NaN;
      const seconds = Number.isFinite(deadline)
        ? Math.ceil((deadline - Date.now()) / 1000)
        : 60;
      if (seconds <= 0) return;
      const progress = Math.max(0, Math.min(12, Math.ceil(seconds / 5)));
      body = `${data.serviceType === 'viajes' ? 'Viaje' : 'Envío'} disponible · ${seconds}s\n${'█'.repeat(progress)}${'░'.repeat(12 - progress)}`;
    }

    await self.registration.showNotification(
      typeof data.title === 'string' ? data.title : 'Aviso de Llévalo',
      {
        body,
        icon: '/logo.svg',
        badge: '/logo.svg',
        tag: `${data.kind}-${orderId}`,
        renotify: true,
        requireInteraction: isNewOrder,
        vibrate: isNewOrder ? [160, 80, 160] : undefined,
        actions: isNewOrder
          ? [
            { action: 'apply', title: 'Postularme' },
            { action: 'ignore', title: 'Ignorar' }
          ]
          : [],
        data: { orderId, kind: data.kind }
      }
    );
  })());
});

self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  const data = notification.data || {};
  const orderId = Number(data.orderId);
  const action = event.action === 'apply' ? 'apply' : event.action === 'ignore' ? 'ignore' : 'open';
  notification.close();

  if (action === 'ignore') return;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (!('focus' in client)) continue;
      await client.focus();
      client.postMessage({
        type: 'driver-notification-action',
        action,
        orderId: Number.isSafeInteger(orderId) ? orderId : null
      });
      return;
    }

    const url = new URL('/', self.location.origin);
    url.searchParams.set('notificationAction', action);
    if (Number.isSafeInteger(orderId)) url.searchParams.set('orderId', String(orderId));
    await self.clients.openWindow(url.toString());
  })());
});
