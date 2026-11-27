export interface GoogleMapsCoordinates {
  lat: number;
  lng: number;
}

export type GoogleMapsLocationInput =
  | { kind: 'coordinates'; coordinates: GoogleMapsCoordinates }
  | { kind: 'search'; query: string }
  | { kind: 'short-link' }
  | { kind: 'unsupported' };

const parseCoordinates = (value: string): GoogleMapsCoordinates | null => {
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
};

const parseEmbeddedCoordinates = (value: string): GoogleMapsCoordinates | null => {
  const atCoordinates = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atCoordinates) {
    const coordinates = parseCoordinates(`${atCoordinates[1]},${atCoordinates[2]}`);
    if (coordinates) return coordinates;
  }

  const latitudeFirst = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (latitudeFirst) {
    const coordinates = parseCoordinates(`${latitudeFirst[1]},${latitudeFirst[2]}`);
    if (coordinates) return coordinates;
  }

  const longitudeFirst = value.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
  return longitudeFirst
    ? parseCoordinates(`${longitudeFirst[2]},${longitudeFirst[1]}`)
    : null;
};

const decodePathSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' ')).trim();
  } catch {
    return '';
  }
};

export const parseGoogleMapsLocationInput = (
  input: string,
  target: 'origen' | 'destino'
): GoogleMapsLocationInput | null => {
  const value = input.trim();
  if (!value) return null;

  const plainCoordinates = parseCoordinates(value);
  if (plainCoordinates) return { kind: 'coordinates', coordinates: plainCoordinates };
  if (!/^https?:\/\//i.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'maps.app.goo.gl' || (hostname === 'goo.gl' && url.pathname.startsWith('/maps/'))) {
    return { kind: 'short-link' };
  }

  const isGoogleMapsHost = /^(?:maps\.|www\.)?google\.(?:com|[a-z]{2,3}(?:\.[a-z]{2})?)$/.test(hostname);
  if (!isGoogleMapsHost || (hostname !== 'maps.google.com' && !url.pathname.startsWith('/maps'))) {
    return null;
  }

  const parameterNames = target === 'origen'
    ? ['origin', 'q', 'query', 'll', 'center']
    : ['destination', 'daddr', 'q', 'query', 'll', 'center'];
  const parameterValues = parameterNames
    .map(name => url.searchParams.get(name))
    .filter((parameter): parameter is string => Boolean(parameter));

  for (const parameter of parameterValues) {
    const coordinates = parseCoordinates(parameter);
    if (coordinates) return { kind: 'coordinates', coordinates };
  }

  const embeddedCoordinates = parseEmbeddedCoordinates(`${url.pathname}${url.search}`);
  if (embeddedCoordinates) return { kind: 'coordinates', coordinates: embeddedCoordinates };

  const parameterQuery = parameterValues.find(parameter => parameter.trim());
  if (parameterQuery) return { kind: 'search', query: parameterQuery.trim() };

  const segments = url.pathname.split('/').filter(Boolean);
  const placeIndex = segments.indexOf('place');
  if (placeIndex >= 0 && segments[placeIndex + 1]) {
    const place = decodePathSegment(segments[placeIndex + 1]);
    const coordinates = parseCoordinates(place);
    if (coordinates) return { kind: 'coordinates', coordinates };
    if (place) return { kind: 'search', query: place };
  }

  const searchIndex = segments.indexOf('search');
  if (searchIndex >= 0 && segments[searchIndex + 1]) {
    const search = decodePathSegment(segments[searchIndex + 1]);
    const coordinates = parseCoordinates(search);
    if (coordinates) return { kind: 'coordinates', coordinates };
    if (search) return { kind: 'search', query: search };
  }

  const directionsIndex = segments.indexOf('dir');
  const directionsSegment = target === 'origen' ? segments[directionsIndex + 1] : segments[directionsIndex + 2];
  if (directionsIndex >= 0 && directionsSegment) {
    const direction = decodePathSegment(directionsSegment);
    if (direction && direction !== 'Current+Location') return { kind: 'search', query: direction };
  }

  return { kind: 'unsupported' };
};
