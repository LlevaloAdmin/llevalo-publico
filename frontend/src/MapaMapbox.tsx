import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapaMapboxProps {
  coordsOrigen?: { lat: number; lng: number } | null;
  coordsDestino?: { lat: number; lng: number } | null;
  coordsUsuario?: { lat: number; lng: number } | null;
  modoSeleccion?: 'origen' | 'destino' | null;
  onMapClick?: (lat: number, lng: number) => void;
  onRutaCalculada?: (distanciaKm: number, tiempoMin: number) => void;
  mini?: boolean;
  interactivo?: boolean;
  mostrarRuta?: boolean;
  mostrarPines?: boolean;
  darkMode?: boolean;
}

export default function MapaMapbox({
  coordsOrigen,
  coordsDestino,
  coordsUsuario,
  modoSeleccion,
  onMapClick,
  onRutaCalculada,
  mini = false,
  interactivo = true,
  mostrarRuta = false,
  mostrarPines = false,
  darkMode = false
}: MapaMapboxProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markerOrigenRef = useRef<mapboxgl.Marker | null>(null);
  const markerDestinoRef = useRef<mapboxgl.Marker | null>(null);
  const markerUsuarioRef = useRef<mapboxgl.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => {
    if (onMapClick) onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.getCanvas().style.cursor = modoSeleccion ? 'crosshair' : '';
  }, [modoSeleccion]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const estiloDeseado = darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';
    mapInstance.current.setStyle(estiloDeseado);
  }, [darkMode]);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
    mapboxgl.accessToken = token;

    if (!mapContainer.current) return;

    // San Diego, Carabobo por defecto (10.2291, -68.0055)
    const centroSanDiego = { lat: 10.2291, lng: -68.0055 };
    const centroInicial = coordsUsuario || centroSanDiego;

    if (!mapInstance.current) {
      mapInstance.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
        center: [centroInicial.lng, centroInicial.lat],
        zoom: mini ? 12 : 14,
        interactive: mini ? false : interactivo
      });

      if (!mini) {
        mapInstance.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
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
        markerUsuarioRef.current = new mapboxgl.Marker({ element: elUsuario, anchor: 'bottom' });
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
        markerOrigenRef.current = new mapboxgl.Marker({ element: elOrigen, anchor: 'bottom' });
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
        markerDestinoRef.current = new mapboxgl.Marker({ element: elDestino, anchor: 'bottom' });
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

    const fetchRoute = async () => {
      if (!mostrarRuta || !coordsOrigen || !coordsDestino) {
        limpiarRutaMapa();
        return;
      }
      try {
        const query = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsOrigen.lng},${coordsOrigen.lat};${coordsDestino.lng},${coordsDestino.lat}?geometries=geojson&access_token=${token}`
        );
        const json = await query.json();
        if (json.routes && json.routes.length > 0) {
          const ruta = json.routes[0];
          const routeGeoJSON = ruta.geometry;

          if (onRutaCalculada && !mini) {
            const km = Math.max(0.5, parseFloat((ruta.distance / 1000).toFixed(1)));
            const min = Math.max(2, Math.round(ruta.duration / 60));
            onRutaCalculada(km, min);
          }

          const actualizarRutaLayer = () => {
            if (!mostrarRuta) {
              limpiarRutaMapa();
              return;
            }
            if (map.getSource('route')) {
              (map.getSource('route') as mapboxgl.GeoJSONSource).setData({
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

            if (!mini && coordsOrigen && coordsDestino) {
              const bounds = new mapboxgl.LngLatBounds();
              bounds.extend([coordsOrigen.lng, coordsOrigen.lat]);
              bounds.extend([coordsDestino.lng, coordsDestino.lat]);
              map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 1000 });
            }
          };

          if (map.isStyleLoaded()) actualizarRutaLayer();
          else map.once('load', actualizarRutaLayer);
        } else {
          limpiarRutaMapa();
        }
      } catch (e) {
        console.error(e);
      }
    };

    if (mostrarRuta && coordsOrigen && coordsDestino) {
      fetchRoute();
    } else {
      limpiarRutaMapa();
    }

  }, [coordsOrigen, coordsDestino, coordsUsuario, mini, mostrarRuta, mostrarPines, darkMode]);

  return (
    <div className={`w-full h-full rounded-3xl overflow-hidden relative ${mini ? 'shadow-inner' : 'shadow-md border border-orange-100 dark:border-slate-800'}`}>
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