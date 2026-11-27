import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export interface GoogleMapsLibraries {
  maps: google.maps.MapsLibrary;
  geocoding: google.maps.GeocodingLibrary;
  places: google.maps.PlacesLibrary;
  routes: google.maps.RoutesLibrary;
}

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
