import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

const estiloClaro = 'https://tiles.openfreemap.org/styles/liberty';
const estiloOscuro = 'https://tiles.openfreemap.org/styles/dark';

interface MapaLibreProps {
  coordsOrigen?: { lat: number; lng: number } | null;
  coordsDestino?: { lat: number; lng: number } | null;
  coordsUsuario?: { lat: number; lng: number } | null;
  modoSeleccion?: 'origen' | 'destino' | null;
  onMapClick?: (lat: number, lng: number) => void;
  onRutaCalculada?: (distanciaKm: number, tiempoMin: number) => void;
  onErrorRuta?: (mensaje: string) => void;
  mini?: boolean;
  interactivo?: boolean;
  mostrarRuta?: boolean;
  mostrarPines?: boolean;
  darkMode?: boolean;
  recentrarUsuario?: number;
}

export default function MapaLibre({
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
  darkMode = false,
  recentrarUsuario = 0
}: MapaLibreProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const markerOrigenRef = useRef<maplibregl.Marker | null>(null);
  const markerDestinoRef = useRef<maplibregl.Marker | null>(null);
  const markerUsuarioRef = useRef<maplibregl.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onRutaCalculadaRef = useRef(onRutaCalculada);
  const onErrorRutaRef = useRef(onErrorRuta);
  const routeRequestKeyRef = useRef<string | null>(null);
  const routeAbortControllerRef = useRef<AbortController | null>(null);
  const interactivoRef = useRef(interactivo);
  const coordsUsuarioRef = useRef(coordsUsuario);

  useEffect(() => {
    coordsUsuarioRef.current = coordsUsuario;
  }, [coordsUsuario]);

  useEffect(() => {
    onRutaCalculadaRef.current = onRutaCalculada;
  }, [onRutaCalculada]);

  useEffect(() => {
    onErrorRutaRef.current = onErrorRuta;
  }, [onErrorRuta]);

  useEffect(() => {
    interactivoRef.current = interactivo;
  }, [interactivo]);

  useEffect(() => {
    if (!recentrarUsuario) return;
    const map = mapInstance.current;
    const ubicacion = coordsUsuarioRef.current;
    if (map && ubicacion) {
      map.flyTo({ center: [ubicacion.lng, ubicacion.lat], zoom: 15, duration: 800 });
    }
  }, [recentrarUsuario]);

  useEffect(() => {
    if (onMapClick) onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.getCanvas().style.cursor = modoSeleccion ? 'crosshair' : '';
  }, [modoSeleccion]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const estiloDeseado = darkMode ? estiloOscuro : estiloClaro;
    mapInstance.current.setStyle(estiloDeseado);
  }, [darkMode]);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';

    if (!mapContainer.current) return;

    // San Diego, Carabobo por defecto (10.2291, -68.0055)
    const centroSanDiego = { lat: 10.2291, lng: -68.0055 };
    const centroInicial = coordsUsuario || centroSanDiego;

    if (!mapInstance.current) {
      mapInstance.current = new maplibregl.Map({
        container: mapContainer.current,
        style: darkMode ? estiloOscuro : estiloClaro,
        center: [centroInicial.lng, centroInicial.lat],
        zoom: mini ? 12 : 14,
        interactive: mini ? false : interactivoRef.current
      });

      if (!mini) {
        mapInstance.current.addControl(new maplibregl.NavigationControl(), 'top-right');
        mapInstance.current.on('click', (e) => {
          if (onMapClickRef.current) onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
        });
      }
    }

    const map = mapInstance.current;

    // --- MARCADOR USUARIO (AZUL) ---
    if (coordsUsuario) {
      if (!markerUsuarioRef.current) {
        const elUsuario = document.createElement('div');
        elUsuario.innerHTML = `
          <div style="background-color: #3B82F6; width: 28px; height: 28px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.4); border: 2.5px solid white;">
            <div style="width: 9px; height: 9px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
          </div>`;
        markerUsuarioRef.current = new maplibregl.Marker({ element: elUsuario, anchor: 'bottom' });
      }
      markerUsuarioRef.current.setLngLat([coordsUsuario.lng, coordsUsuario.lat]).addTo(map);
    } else {
      if (markerUsuarioRef.current) markerUsuarioRef.current.remove();
    }

    // --- MARCADOR ORIGEN (VERDE) ---
    if (mostrarPines && coordsOrigen) {
      if (!markerOrigenRef.current) {
        const elOrigen = document.createElement('div');
        elOrigen.innerHTML = `
          <div style="background-color: #10B981; width: ${mini ? 20 : 26}px; height: ${mini ? 20 : 26}px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 5px rgba(0,0,0,0.3); border: 2px solid white;">
            <div style="width: ${mini ? 6 : 8}px; height: ${mini ? 6 : 8}px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
          </div>`;
        markerOrigenRef.current = new maplibregl.Marker({ element: elOrigen, anchor: 'bottom' });
      }
      markerOrigenRef.current.setLngLat([coordsOrigen.lng, coordsOrigen.lat]).addTo(map);
    } else {
      if (markerOrigenRef.current) markerOrigenRef.current.remove();
    }

    // --- MARCADOR DESTINO (ROJO) ---
    if (mostrarPines && coordsDestino) {
      if (!markerDestinoRef.current) {
        const elDestino = document.createElement('div');
        elDestino.innerHTML = `
          <div style="background-color: #EF4444; width: ${mini ? 20 : 26}px; height: ${mini ? 20 : 26}px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 5px rgba(0,0,0,0.3); border: 2px solid white;">
            <div style="width: ${mini ? 6 : 8}px; height: ${mini ? 6 : 8}px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
          </div>`;
        markerDestinoRef.current = new maplibregl.Marker({ element: elDestino, anchor: 'bottom' });
      }
      markerDestinoRef.current.setLngLat([coordsDestino.lng, coordsDestino.lat]).addTo(map);
    } else {
      if (markerDestinoRef.current) markerDestinoRef.current.remove();
    }

    // --- RUTA Y ENCUADRE AUTOMÁTICO (FIT BOUNDS) ---
    const limpiarRutaMapa = () => {
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');
    };

    const fetchRoute = async (
      routeKey: string,
      origen: { lat: number; lng: number },
      destino: { lat: number; lng: number }
    ) => {
      routeAbortControllerRef.current?.abort();
      const controller = new AbortController();
      routeAbortControllerRef.current = controller;
      try {
        if (!token) throw new Error('Falta configurar VITE_MAPBOX_TOKEN para calcular rutas.');
        const query = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?geometries=geojson&access_token=${token}`,
          { signal: controller.signal }
        );
        if (!query.ok) throw new Error(`Mapbox respondió HTTP ${query.status}`);
        const json = await query.json();
        if (routeRequestKeyRef.current !== routeKey || controller.signal.aborted) return;
        if (json.routes && json.routes.length > 0) {
          const ruta = json.routes[0];
          const routeGeoJSON = ruta.geometry;

          if (onRutaCalculadaRef.current && !mini) {
            const km = Math.max(0.5, parseFloat((ruta.distance / 1000).toFixed(1)));
            const min = Math.max(2, Math.round(ruta.duration / 60));
            onRutaCalculadaRef.current(km, min);
          }

          const actualizarRutaLayer = () => {
            if (routeRequestKeyRef.current !== routeKey) return;
            if (map.getSource('route')) {
              (map.getSource('route') as maplibregl.GeoJSONSource).setData({
                type: 'Feature',
                properties: {},
                geometry: routeGeoJSON
              });
            } else {
              map.addSource('route', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: routeGeoJSON
                }
              });
              map.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#FF5722', 'line-width': mini ? 4 : 6, 'line-opacity': 0.85 }
              });
            }

            if (!mini) {
              const bounds = new maplibregl.LngLatBounds();
              bounds.extend([origen.lng, origen.lat]);
              bounds.extend([destino.lng, destino.lat]);
              map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 1000 });
            }
          };

          if (map.isStyleLoaded()) actualizarRutaLayer();
          else map.once('style.load', actualizarRutaLayer);
        } else {
          limpiarRutaMapa();
          onErrorRutaRef.current?.('No se encontró una ruta transitable entre esos puntos. Ajusta las ubicaciones.');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error calculando la ruta:', error);
        onErrorRutaRef.current?.(error instanceof Error ? error.message : 'No se pudo calcular la ruta.');
      }
    };

    if (mostrarRuta && coordsOrigen && coordsDestino) {
      const routeKey = `${coordsOrigen.lat},${coordsOrigen.lng};${coordsDestino.lat},${coordsDestino.lng};${darkMode}`;
      if (routeRequestKeyRef.current !== routeKey) {
        routeRequestKeyRef.current = routeKey;
        void fetchRoute(routeKey, coordsOrigen, coordsDestino);
      }
    } else {
      routeRequestKeyRef.current = null;
      routeAbortControllerRef.current?.abort();
      limpiarRutaMapa();
    }

  }, [coordsOrigen, coordsDestino, coordsUsuario, mini, mostrarRuta, mostrarPines, darkMode]);

  useEffect(() => () => {
    routeAbortControllerRef.current?.abort();
    mapInstance.current?.remove();
    mapInstance.current = null;
  }, []);

  return (
    <div className={`w-full h-full rounded-3xl overflow-hidden relative ${darkMode ? 'maplibre-dark-theme' : ''} ${mini ? 'shadow-inner' : 'shadow-md border border-orange-100 dark:border-slate-800'}`}>
      {modoSeleccion && !mini && (
        <div className="absolute top-4 left-4 z-10 bg-slate-900/90 text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg flex items-center space-x-2 backdrop-blur">
          <span className={`w-3 h-3 rounded-full animate-ping ${modoSeleccion === 'origen' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
          <span>Haz clic en el mapa para fijar el {modoSeleccion === 'origen' ? 'Origen (Verde)' : 'Destino (Rojo)'}</span>
        </div>
      )}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}