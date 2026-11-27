import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, type GoogleMapsLibraries } from './googleMaps';

interface Coordenadas {
  lat: number;
  lng: number;
}

interface MapaGoogleProps {
  coordsOrigen?: Coordenadas | null;
  coordsDestino?: Coordenadas | null;
  coordsUsuario?: Coordenadas | null;
  modoSeleccion?: 'origen' | 'destino' | null;
  onMapClick?: (lat: number, lng: number) => void;
  onRutaCalculada?: (distanciaKm: number, tiempoMin: number) => void;
  onErrorRuta?: (mensaje: string) => void;
  mini?: boolean;
  interactivo?: boolean;
  mostrarRuta?: boolean;
  mostrarPines?: boolean;
  navegacionActiva?: boolean;
  seguirUsuario?: boolean;
  darkMode?: boolean;
  recentrarUsuario?: number;
}

const distanciaEntre = (a: Coordenadas, b: Coordenadas): number => {
  const radioTierra = 6_371_000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLng = (b.lng - a.lng) * Math.PI / 180;
  const formula = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return radioTierra * 2 * Math.atan2(Math.sqrt(formula), Math.sqrt(1 - formula));
};

const crearIcono = (color: string, radio: number): google.maps.Symbol => ({
  path: google.maps.SymbolPath.CIRCLE,
  scale: radio,
  fillColor: color,
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 2
});

export default function MapaGoogle({
  coordsOrigen,
  coordsDestino,
  coordsUsuario,
  modoSeleccion,
  onMapClick,
  onRutaCalculada,
  onErrorRuta,
  mini = false,
  interactivo = true,
  mostrarRuta = false,
  mostrarPines = false,
  navegacionActiva = false,
  seguirUsuario = false,
  darkMode = false,
  recentrarUsuario = 0
}: MapaGoogleProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const librariesRef = useRef<GoogleMapsLibraries | null>(null);
  const markerOrigenRef = useRef<google.maps.Marker | null>(null);
  const markerDestinoRef = useRef<google.maps.Marker | null>(null);
  const markerUsuarioRef = useRef<google.maps.Marker | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onRutaCalculadaRef = useRef(onRutaCalculada);
  const onErrorRutaRef = useRef(onErrorRuta);
  const routeRequestKeyRef = useRef<string | null>(null);
  const routeCoordinatesRef = useRef<Coordenadas[]>([]);
  const routeRequestRef = useRef<((
    routeKey: string,
    origen: Coordenadas,
    destino: Coordenadas
  ) => Promise<void> | void) | null>(null);
  const lastDirectionsAtRef = useRef(0);
  const seguimientoActivoRef = useRef(seguirUsuario);
  const seguirUsuarioRef = useRef(seguirUsuario);
  const coordsUsuarioRef = useRef(coordsUsuario);
  const ubicacionBaseSeguimientoRef = useRef<Coordenadas | null>(coordsUsuario ?? null);
  const opcionesInicialesRef = useRef({ mini, interactivo });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onRutaCalculadaRef.current = onRutaCalculada;
  }, [onRutaCalculada]);

  useEffect(() => {
    onErrorRutaRef.current = onErrorRuta;
  }, [onErrorRuta]);

  useEffect(() => {
    coordsUsuarioRef.current = coordsUsuario;
  }, [coordsUsuario]);

  useEffect(() => {
    seguirUsuarioRef.current = seguirUsuario;
    seguimientoActivoRef.current = seguirUsuario;
    if (seguirUsuario) ubicacionBaseSeguimientoRef.current = coordsUsuarioRef.current ?? null;
  }, [seguirUsuario]);

  useEffect(() => {
    let descartado = false;
    void loadGoogleMaps().then(libraries => {
      if (descartado || !mapContainer.current) return;
      librariesRef.current = libraries;
      const centroInicial = coordsUsuarioRef.current ?? { lat: 10.2291, lng: -68.0055 };
      const { mini: esMini, interactivo: esInteractivo } = opcionesInicialesRef.current;
      const map = new libraries.maps.Map(mapContainer.current, {
        center: centroInicial,
        zoom: esMini ? 12 : 14,
        mapTypeId: libraries.maps.MapTypeId.ROADMAP,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl: false,
        clickableIcons: false,
        gestureHandling: esMini || !esInteractivo ? 'none' : 'greedy',
        zoomControl: !esMini
      });
      mapInstance.current = map;
      routePolylineRef.current = new google.maps.Polyline({
        map,
        path: [],
        strokeColor: '#FF5722',
        strokeOpacity: 0.88,
        strokeWeight: esMini ? 4 : 6,
        zIndex: 2
      });
      setMapError('');
      setMapReady(true);
    }).catch(error => {
      if (descartado) return;
      console.error('No se pudo cargar Google Maps:', error);
      setMapError(error instanceof Error ? error.message : 'No se pudo cargar Google Maps.');
    });

    return () => {
      descartado = true;
      markerOrigenRef.current = null;
      markerDestinoRef.current = null;
      markerUsuarioRef.current = null;
      routePolylineRef.current = null;
      mapInstance.current = null;
      librariesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !map) return;
    map.setOptions({
      gestureHandling: mini || !interactivo ? 'none' : 'greedy',
      zoomControl: !mini
    });
    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      const location = event.latLng;
      if (location) onMapClickRef.current?.(location.lat(), location.lng());
    });
    const dragListener = map.addListener('dragstart', () => {
      if (!seguirUsuarioRef.current) return;
      seguimientoActivoRef.current = false;
      ubicacionBaseSeguimientoRef.current = coordsUsuarioRef.current ?? null;
    });
    return () => {
      clickListener.remove();
      dragListener.remove();
    };
  }, [interactivo, mapReady, mini]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !map) return;

    const actualizarMarcador = (
      markerRef: React.MutableRefObject<google.maps.Marker | null>,
      position: Coordenadas | null | undefined,
      color: string,
      radius: number,
      visible: boolean
    ) => {
      if (!position || !visible) {
        markerRef.current?.setMap(null);
        return;
      }
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          map,
          position,
          icon: crearIcono(color, radius),
          clickable: false,
          zIndex: color === '#2563EB' ? 3 : 2
        });
      } else {
        markerRef.current.setMap(map);
        markerRef.current.setPosition(position);
      }
    };

    actualizarMarcador(markerUsuarioRef, coordsUsuario, '#2563EB', 8, true);
    actualizarMarcador(markerOrigenRef, coordsOrigen, '#10B981', mini ? 7 : 10, mostrarPines);
    actualizarMarcador(markerDestinoRef, coordsDestino, '#EF4444', mini ? 7 : 10, mostrarPines);
  }, [coordsDestino, coordsOrigen, coordsUsuario, mapReady, mini, mostrarPines]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !map) return;
    const rutaActual = routePolylineRef.current;
    if (!mostrarRuta || !coordsOrigen || !coordsDestino) {
      routeRequestKeyRef.current = null;
      routeCoordinatesRef.current = [];
      rutaActual?.setPath([]);
      return;
    }

    const libraries = librariesRef.current;
    if (!libraries) return;
    const routeKey = `${navegacionActiva ? 'navigation:' : ''}${coordsOrigen.lat},${coordsOrigen.lng};${coordsDestino.lat},${coordsDestino.lng}`;

    const calculateRoute = async (
      key: string,
      origen: Coordenadas,
      destino: Coordenadas
    ): Promise<void> => {
      lastDirectionsAtRef.current = Date.now();
      try {
        const response = await libraries.routes.Route.computeRoutes({
          origin: origen,
          destination: destino,
          travelMode: 'DRIVING',
          region: 'VE',
          language: 'es',
          routingPreference: 'TRAFFIC_UNAWARE',
          polylineQuality: 'OVERVIEW',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport']
        });
        if (routeRequestKeyRef.current !== key) return;
        const route = response.routes?.[0];
        if (!route?.path?.length || !route.distanceMeters || !route.durationMillis) {
          routeCoordinatesRef.current = [];
          rutaActual?.setPath([]);
          onErrorRutaRef.current?.('Google no encontró una ruta transitable entre esos puntos. Ajusta las ubicaciones.');
          return;
        }

        const path = route.path.map(point => ({ lat: point.lat, lng: point.lng }));
        routeCoordinatesRef.current = path;
        rutaActual?.setPath(path);
        if (onRutaCalculadaRef.current && !mini) {
          onRutaCalculadaRef.current(
            Math.max(0.5, Number((route.distanceMeters / 1000).toFixed(1))),
            Math.max(2, Math.round(route.durationMillis / 60_000))
          );
        }
        if (!mini && !navegacionActiva && route.viewport) {
          map.fitBounds(route.viewport, 90);
        }
      } catch (error) {
        if (routeRequestKeyRef.current !== key) return;
        console.error('Error calculando la ruta con Google Routes:', error);
        onErrorRutaRef.current?.(error instanceof Error
          ? error.message
          : 'No se pudo calcular la ruta con Google Maps.');
      }
    };

    routeRequestRef.current = calculateRoute;
    if (routeRequestKeyRef.current !== routeKey) {
      routeRequestKeyRef.current = routeKey;
      routeCoordinatesRef.current = [];
      rutaActual?.setPath([]);
      const routeStart = navegacionActiva && coordsUsuario ? coordsUsuario : coordsOrigen;
      void calculateRoute(routeKey, routeStart, coordsDestino);
    }
  }, [coordsDestino, coordsOrigen, coordsUsuario, mapReady, mini, mostrarRuta, navegacionActiva]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !map || !seguirUsuario || !coordsUsuario) return;
    const ubicacionBase = ubicacionBaseSeguimientoRef.current;
    if (!seguimientoActivoRef.current && ubicacionBase) {
      if (distanciaEntre(ubicacionBase, coordsUsuario) < 30) return;
      seguimientoActivoRef.current = true;
    }
    const centro = map.getCenter();
    if (centro && distanciaEntre(
      { lat: centro.lat(), lng: centro.lng() },
      coordsUsuario
    ) < 4) return;
    ubicacionBaseSeguimientoRef.current = coordsUsuario;
    map.panTo(coordsUsuario);
  }, [coordsUsuario, mapReady, seguirUsuario]);

  useEffect(() => {
    const ubicacion = coordsUsuarioRef.current;
    if (!recentrarUsuario || !mapReady || !ubicacion) return;
    seguimientoActivoRef.current = true;
    ubicacionBaseSeguimientoRef.current = ubicacion;
    mapInstance.current?.panTo(ubicacion);
    mapInstance.current?.setZoom(15);
  }, [mapReady, recentrarUsuario]);

  useEffect(() => {
    const coordinates = routeCoordinatesRef.current;
    const routeKey = routeRequestKeyRef.current;
    if (!navegacionActiva || !coordsUsuario || !coordsDestino || coordinates.length < 2 || !routeKey) return;
    if (Date.now() - lastDirectionsAtRef.current < 30_000) return;

    const metersPerLatitude = 111_320;
    const metersPerLongitude = metersPerLatitude * Math.cos(coordsUsuario.lat * Math.PI / 180);
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < coordinates.length; index += 1) {
      const previous = coordinates[index - 1];
      const current = coordinates[index];
      const ax = (previous.lng - coordsUsuario.lng) * metersPerLongitude;
      const ay = (previous.lat - coordsUsuario.lat) * metersPerLatitude;
      const bx = (current.lng - coordsUsuario.lng) * metersPerLongitude;
      const by = (current.lat - coordsUsuario.lat) * metersPerLatitude;
      const segmentX = bx - ax;
      const segmentY = by - ay;
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection = segmentLengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * segmentX + ay * segmentY) / segmentLengthSquared));
      const distance = Math.hypot(ax + projection * segmentX, ay + projection * segmentY);
      nearestDistance = Math.min(nearestDistance, distance);
    }

    if (nearestDistance > 50) {
      void routeRequestRef.current?.(routeKey, coordsUsuario, coordsDestino);
    }
  }, [coordsDestino, coordsUsuario, navegacionActiva]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.setOptions({ draggableCursor: modoSeleccion ? 'crosshair' : null });
  }, [mapReady, modoSeleccion]);

  return (
    <div className={`google-map relative h-full w-full overflow-hidden rounded-3xl ${mini ? 'shadow-inner' : `shadow-md border ${darkMode ? 'border-slate-700' : 'border-orange-100'}`}`}>
      <div ref={mapContainer} className="h-full w-full" />
      {mapError && (
        <div role="alert" className="absolute inset-x-3 top-3 z-10 rounded-xl border border-amber-300 bg-amber-50/95 p-3 text-xs font-medium text-amber-900 shadow">
          No se pudo cargar Google Maps: {mapError}
        </div>
      )}
    </div>
  );
}
