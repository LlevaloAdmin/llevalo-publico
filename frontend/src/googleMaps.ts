import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export interface GoogleMapsLibraries {
  maps: google.maps.MapsLibrary;
  geocoding: google.maps.GeocodingLibrary;
  places: google.maps.PlacesLibrary;
  routes: google.maps.RoutesLibrary;
}

export const mensajeErrorGoogleMaps = (error: unknown, servicio: string): string => {
  const detalle = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  if (/PERMISSION_DENIED|REQUEST_DENIED|not authorized|not activated|billing|ApiNotActivated|RefererNotAllowed|InvalidKey|ProjectNotFound/i.test(detalle)) {
    return `Google rechazó ${servicio}. Habilítalo en el mismo proyecto de la clave, activa la facturación y permite esta API y el dominio en las restricciones de la clave.`;
  }
  return detalle || `No se pudo completar la solicitud con ${servicio}.`;
};

let optionsConfigured = false;
let librariesPromise: Promise<GoogleMapsLibraries> | null = null;

export const loadGoogleMaps = (): Promise<GoogleMapsLibraries> => {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return Promise.reject(new Error('Falta configurar VITE_GOOGLE_MAPS_API_KEY en el frontend.'));

  if (!optionsConfigured) {
    setOptions({ key, v: 'weekly', language: 'es', region: 'VE' });
    optionsConfigured = true;
  }

  if (!librariesPromise) {
    librariesPromise = Promise.all([
      importLibrary('maps'),
      importLibrary('geocoding'),
      importLibrary('places'),
      importLibrary('routes')
    ]).then(([maps, geocoding, places, routes]) => ({
      maps,
      geocoding,
      places,
      routes
    })).catch(error => {
      librariesPromise = null;
      throw error;
    });
  }

  return librariesPromise;
};
