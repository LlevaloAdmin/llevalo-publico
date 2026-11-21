import { getApps, initializeApp } from '@firebase/app';
import { getMessaging, getToken, isSupported } from '@firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim()
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim();

export const registerWebPushToken = async (): Promise<string> => {
  const missingConfig = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missingConfig.length > 0 || !vapidKey) {
    throw new Error('Configura los valores públicos de Firebase y VITE_FIREBASE_VAPID_KEY en Vercel.');
  }
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') {
    throw new Error('Este navegador no admite notificaciones push.');
  }
  if (Notification.permission !== 'granted') {
    throw new Error('Concede el permiso de notificaciones antes de registrar este dispositivo.');
  }
  if (!await isSupported()) throw new Error('Este navegador no es compatible con Firebase Cloud Messaging.');

  const app = getApps().find(candidate => candidate.name === 'llevalo-web')
    ?? initializeApp(firebaseConfig, 'llevalo-web');
  const registration = await navigator.serviceWorker.register('/notifications-sw.js');
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration
  });
  if (!token) throw new Error('Firebase no entregó un token para este navegador.');
  return token;
};
