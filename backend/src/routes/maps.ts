import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';

const router = Router();
const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const GOOGLE_MAPS_REDIRECT_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.co.ve',
  'www.google.co.ve',
  'maps.google.co.ve',
  'google.com.ve',
  'www.google.com.ve',
  'maps.google.com.ve'
]);
const MAX_REDIRECTS = 5;

const esUrlHttpsValida = (url: URL): boolean =>
  url.protocol === 'https:'
  && !url.username
  && !url.password
  && !url.port;

const esEnlaceCortoValido = (url: URL): boolean =>
  esUrlHttpsValida(url)
  && (url.hostname === 'maps.app.goo.gl'
    || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/')));

const esUrlFinalDeMaps = (url: URL): boolean =>
  esUrlHttpsValida(url)
  && GOOGLE_MAPS_REDIRECT_HOSTS.has(url.hostname)
  && (url.pathname.startsWith('/maps') || url.hostname.startsWith('maps.google.'));

const resolverEnlaceCorto = async (value: string): Promise<string | null> => {
  let currentUrl = new URL(value);
  if (!esEnlaceCortoValido(currentUrl)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount += 1) {
      if (esUrlFinalDeMaps(currentUrl)) return currentUrl.toString();
      if (!SHORT_LINK_HOSTS.has(currentUrl.hostname)
        && !GOOGLE_MAPS_REDIRECT_HOSTS.has(currentUrl.hostname)) return null;

      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Llevalo-Maps-Link-Resolver/1.0'
        },
        signal: controller.signal
      });
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (response.status < 300 || response.status >= 400 || !location) return null;

      const nextUrl = new URL(location, currentUrl);
      if (!esUrlHttpsValida(nextUrl)
        || (!SHORT_LINK_HOSTS.has(nextUrl.hostname)
          && !GOOGLE_MAPS_REDIRECT_HOSTS.has(nextUrl.hostname))) return null;
      currentUrl = nextUrl;
    }

    return esUrlFinalDeMaps(currentUrl) ? currentUrl.toString() : null;
  } finally {
    clearTimeout(timeout);
  }
};

router.use(requireAuth);

router.post('/resolve-link', rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Se alcanzó el límite de enlaces. Inténtalo en un minuto.' }
}), async (req: Request, res: Response): Promise<void> => {
  const value = req.body?.url;
  if (typeof value !== 'string' || value.length > 2048) {
    res.status(400).json({ error: 'Envía un enlace de Google Maps válido.' });
    return;
  }

  try {
    const resolvedUrl = await resolverEnlaceCorto(value);
    if (!resolvedUrl) {
      res.status(422).json({ error: 'No se pudo leer este enlace corto de Google Maps.' });
      return;
    }
    res.json({ url: resolvedUrl });
  } catch (error) {
    console.error('No se pudo resolver el enlace corto de Google Maps:', error);
    res.status(502).json({ error: 'No se pudo abrir el enlace de Google Maps. Inténtalo de nuevo.' });
  }
});

export default router;
