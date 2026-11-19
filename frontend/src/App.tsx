import React, { useState, useEffect, useRef } from 'react';
import { Bike, MapPin, ArrowRight, User, Eye, EyeOff, Clock, Send, Power, Star, Moon, Sun, DollarSign, XCircle, Navigation, CheckCircle2, Circle, Package, CarFront } from 'lucide-react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

const MapaLibre = React.lazy(() => import('./MapaLibre'));

interface PedidoReal {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_email?: string;
  cliente_cedula?: string;
  cliente_foto?: string;
  repartidor_id?: number;
  repartidor_nombre?: string;
  repartidor_vehiculo?: string;
  repartidor_placa?: string;
  repartidor_foto?: string;
  repartidor_vehiculo_foto?: string;
  repartidor_calificacion?: number;
  tipo_servicio: string;
  descripcion: string;
  origen_texto: string;
  origen_lat: number;
  origen_lon: number;
  destino_texto: string;
  destino_lat: number;
  destino_lon: number;
  distancia_km: number;
  tiempo_min: number;
  tarifa: string;
  metodo_pago?: 'pago_movil' | 'efectivo' | 'saldo_corporativo' | 'no_aplica';
  estado_pago?: 'no_aplica' | 'pendiente' | 'pagado' | 'rechazado' | 'reembolsado' | 'reembolso_pendiente';
  referencia_pago?: string | null;
  creado_en?: string;
  estado: 'pendiente' | 'postulado' | 'aceptado' | 'entregado_repartidor' | 'completado' | 'cancelado';
  repartidor_lat?: number;
  repartidor_lon?: number;
  created_at?: string;
}

type TipoServicio = 'envios' | 'viajes';

const etiquetaTipoServicio = (tipo: string) => {
  if (tipo === 'viajes') return 'Viajes';
  if (tipo === 'comida') return 'Envíos · comida';
  if (tipo === 'mercado') return 'Envíos · mercado';
  return 'Envíos';
};

const etiquetaMetodoPago = (metodo?: string) => {
  if (metodo === 'pago_movil') return 'Pago Móvil';
  if (metodo === 'efectivo') return 'Efectivo';
  if (metodo === 'saldo_corporativo') return 'Saldo corporativo';
  return 'Sin método de pago';
};

interface Postulacion {
  id: number;
  pedido_id: number;
  repartidor_id: number;
  repartidor_nombre: string;
  vehiculo: string;
  placa: string;
  vehiculo_foto?: string;
  calificacion: number;
  estado: 'pendiente' | 'aceptado' | 'rechazado';
}

interface SugerenciaDireccion {
  display_name: string;
  lat: number;
  lon: number;
  tipo: string;
}

const etiquetasTipoDireccion: Record<string, string> = {
  address: 'Dirección',
  house: 'Dirección',
  street: 'Calle',
  neighborhood: 'Sector',
  locality: 'Localidad',
  district: 'Sector',
  place: 'Ciudad',
  city: 'Ciudad',
  poi: 'Establecimiento'
};

interface PropiedadesPhoton {
  name?: unknown;
  street?: unknown;
  housenumber?: unknown;
  locality?: unknown;
  district?: unknown;
  city?: unknown;
  state?: unknown;
  type?: unknown;
  osm_key?: unknown;
  osm_value?: unknown;
}

const textoPhoton = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const formatearDireccionPhoton = (properties: PropiedadesPhoton) => {
  const street = textoPhoton(properties.street);
  const houseNumber = textoPhoton(properties.housenumber);
  const parts = [
    textoPhoton(properties.name),
    street ? `${houseNumber ? `${houseNumber} ` : ''}${street}` : '',
    textoPhoton(properties.locality),
    textoPhoton(properties.district),
    textoPhoton(properties.city),
    textoPhoton(properties.state)
  ].filter(Boolean);

  return parts.filter((part, index) => parts.findIndex(candidate => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index)
    .join(', ');
};

const tipoDireccionPhoton = (properties: PropiedadesPhoton) => {
  const osmKey = textoPhoton(properties.osm_key);
  const osmValue = textoPhoton(properties.osm_value);
  if (osmKey === 'place' && ['suburb', 'neighbourhood', 'quarter', 'hamlet'].includes(osmValue)) return 'neighborhood';

  const type = textoPhoton(properties.type);
  if (type === 'street') return 'street';
  if (osmKey && osmKey !== 'place') return 'poi';
  if (type === 'house') return 'address';
  if (type === 'district') return 'district';
  if (type === 'locality') return 'locality';
  if (type === 'city') return 'city';
  return 'place';
};

interface MensajeChat {
  id: number;
  pedido_id: number;
  remitente_id: number;
  remitente_nombre: string;
  mensaje: string;
}

interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  telefono?: string;
  cedula?: string;
  foto?: string;
  vehiculo?: string;
  placa?: string;
  vehiculo_foto?: string;
  calificacion?: number;
  rol: 'cliente' | 'repartidor';
  es_admin?: boolean;
}

type MetodoPagoViaje = 'pago_movil' | 'efectivo' | 'saldo_corporativo';

interface ConfiguracionPago {
  pagoMovil: {
    banco: string;
    telefono: string;
    cedula: string;
    titular: string;
  };
  saldoCorporativo: number;
}

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`;

const authenticatedFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('llevalo_token');
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
};

const mensajeErrorApi = async (response: Response, mensajePredeterminado: string): Promise<string> => {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return `${mensajePredeterminado} (HTTP ${response.status})`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'cliente' | 'repartidor' | 'perfil' | 'auth' | 'admin'>('home');
  const [serviceType, setServiceType] = useState<TipoServicio>('envios');
  
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('llevalo_dark_mode') === 'true');

  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() => {
    const storedUser = localStorage.getItem('llevalo_usuario');
    const storedToken = localStorage.getItem('llevalo_token');
    if (!storedUser || !storedToken) {
      localStorage.removeItem('llevalo_usuario');
      localStorage.removeItem('llevalo_token');
      return null;
    }
    try {
      const parsed = JSON.parse(storedUser);
      return parsed?.id ? parsed : null;
    } catch {
      localStorage.removeItem('llevalo_usuario');
      localStorage.removeItem('llevalo_token');
      return null;
    }
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authRoleSelection, setAuthRoleSelection] = useState<'cliente' | 'repartidor'>('cliente');
  const [errorAuth, setErrorAuth] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState('');

  const [repartidorOnline, setRepartidorOnline] = useState(true);
  const [cambiandoEstadoRepartidor, setCambiandoEstadoRepartidor] = useState(false);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cedulaNumero, setCedulaNumero] = useState(() => usuario?.cedula?.replace(/^[VvEe]-/, '') || '');
  const [fotoLocal, setFotoLocal] = useState(() => usuario?.foto || '');
  const fotoVehiculoLocal = usuario?.vehiculo_foto || '';
  const [tipoVehiculo, setTipoVehiculo] = useState(() => usuario?.vehiculo || 'Moto Suzuki GN 125');
  const [placaVehiculo, setPlacaVehiculo] = useState(() => usuario?.placa || '');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [errorPlaca, setErrorPlaca] = useState('');

  // Validadores de contraseña en tiempo real
  const tieneMinLength = password.length >= 8;
  const tieneMayuscula = /[A-Z]/.test(password);
  const tieneMinuscula = /[a-z]/.test(password);
  const tieneNumero = /\d/.test(password);
  const tieneSigno = /[^A-Za-z0-9]/.test(password);
  const passwordCompleta = tieneMinLength && tieneMayuscula && tieneMinuscula && tieneNumero && tieneSigno;

  const [enviandoPedido, setEnviandoPedido] = useState(false);
  
  const [coordsUsuarioGPS, setCoordsUsuarioGPS] = useState<{ lat: number; lng: number } | null>(null);
  const [ubicacionCargando, setUbicacionCargando] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState('');
  const [recentrarMapa, setRecentrarMapa] = useState(0);
  const objetivoUbicacionRef = useRef<'origen' | 'destino' | null>(null);

  const [origenInput, setOrigenInput] = useState('');
  const [coordsOrigen, setCoordsOrigen] = useState<{ lat: number; lng: number } | null>(null);
  const [referenciaOrigen, setReferenciaOrigen] = useState('');
  const [destinoInput, setDestinoInput] = useState('');
  const [coordsDestino, setCoordsDestino] = useState<{ lat: number; lng: number } | null>(null);
  const [referenciaDestino, setReferenciaDestino] = useState('');
  
  const [modoSeleccionMapa, setModoSeleccionMapa] = useState<'origen' | 'destino' | null>(null);

  const [sugerenciasOrigen, setSugerenciasOrigen] = useState<SugerenciaDireccion[]>([]);
  const [sugerenciasDestino, setSugerenciasDestino] = useState<SugerenciaDireccion[]>([]);
  const [buscandoDireccion, setBuscandoDireccion] = useState({ origen: false, destino: false });
  const [errorGeocoding, setErrorGeocoding] = useState('');
  const [errorRuta, setErrorRuta] = useState('');
  const debounceTimerRef = useRef<Record<'origen' | 'destino', ReturnType<typeof setTimeout> | null>>({
    origen: null,
    destino: null
  });
  const geocodingControllerRef = useRef<Record<'origen' | 'destino', AbortController | null>>({
    origen: null,
    destino: null
  });
  const [distanciaKm, setDistanciaKm] = useState<number>(0);
  const [tiempoEstimadoMin, setTiempoEstimadoMin] = useState<number>(0);
  
  const rutaCompletaLista = Boolean(coordsOrigen && coordsDestino && origenInput.trim() && destinoInput.trim());

  const costoPorKm = serviceType === 'viajes'
    ? (distanciaKm >= 1 ? 0.28 : 0.38)
    : 0.50;
  const tarifaTotal = rutaCompletaLista ? Math.max(1.5, distanciaKm * costoPorKm).toFixed(2) : '0.00';

  const [tasaBCV, setTasaBCV] = useState<number>(904.45);
  const tarifaEnBolivares = (parseFloat(tarifaTotal) * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [pedidosReales, setPedidosReales] = useState<PedidoReal[]>([]);
  const [postulacionesReales, setPostulacionesReales] = useState<Postulacion[]>([]);
  const [mensajesChat, setMensajesChat] = useState<MensajeChat[]>([]);
  const [nuevoMensajeTexto, setNuevoMensajeTexto] = useState('');
  const [metodoPagoViaje, setMetodoPagoViaje] = useState<MetodoPagoViaje>('pago_movil');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [configuracionPago, setConfiguracionPago] = useState<ConfiguracionPago | null>(null);
  const [cargandoConfiguracionPago, setCargandoConfiguracionPago] = useState(false);
  const [errorPago, setErrorPago] = useState('');
  const [pagosPendientesAdmin, setPagosPendientesAdmin] = useState<PedidoReal[]>([]);
  const [cargandoAdmin, setCargandoAdmin] = useState(false);
  const [errorAdmin, setErrorAdmin] = useState('');
  const [mensajeAdmin, setMensajeAdmin] = useState('');
  const [configPagoAdmin, setConfigPagoAdmin] = useState({ banco: '', telefono: '', cedula: '', titular: '' });
  const [emailRecargaSaldo, setEmailRecargaSaldo] = useState('');
  const [montoRecargaSaldo, setMontoRecargaSaldo] = useState('');
  const [notaRecargaSaldo, setNotaRecargaSaldo] = useState('');

  const [segundosRestantes, setSegundosRestantes] = useState<number>(60);

  useEffect(() => {
    const setupFullScreen = async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: darkMode ? Style.Light : Style.Dark });
      } catch (error) {
        console.error('No se pudo configurar la barra de estado:', error);
      }
    };
    void setupFullScreen();
  }, [darkMode]);

  const actualizarTasaBCVEnVivo = async () => {
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (res.ok) {
        const data = await res.json();
        if (data && data.promedio) {
          setTasaBCV(Number(data.promedio));
        }
      }
    } catch {
      console.warn('No se pudo actualizar tasa BCV en tiempo real, usando respaldo.');
    }
  };

  useEffect(() => {
    actualizarTasaBCVEnVivo();
    const intervalTasa = setInterval(actualizarTasaBCVEnVivo, 300000);

    return () => clearInterval(intervalTasa);
  }, []);

  const toggleDarkMode = () => {
    const nuevo = !darkMode;
    setDarkMode(nuevo);
    localStorage.setItem('llevalo_dark_mode', String(nuevo));
  };

  const sincronizarDatos = async () => {
    try {
      const res = await authenticatedFetch(`${API_URL}/api/pedidos`);
      if (res.ok) {
        const data = await res.json();
        setPedidosReales(Array.isArray(data.pedidos) ? data.pedidos : []);
        setPostulacionesReales(Array.isArray(data.postulaciones) ? data.postulaciones : []);
        setMensajesChat(Array.isArray(data.mensajes) ? data.mensajes : []);
      } else if (res.status === 401) {
        localStorage.removeItem('llevalo_token');
        localStorage.removeItem('llevalo_usuario');
        setUsuario(null);
        setActiveTab('home');
      }
    } catch (e) { console.error('Error sincronizando:', e); }
  };

  useEffect(() => {
    if (!usuario) return;
    sincronizarDatos();
    const intervalo = setInterval(sincronizarDatos, 3000);
    return () => clearInterval(intervalo);
  }, [usuario]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSegundosRestantes(prev => (prev > 0 ? prev - 1 : 60));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    for (const tipo of ['origen', 'destino'] as const) {
      if (debounceTimerRef.current[tipo]) clearTimeout(debounceTimerRef.current[tipo]!);
      geocodingControllerRef.current[tipo]?.abort();
    }
  }, []);

  const convertirImagenSegura = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        setter(canvas.toDataURL('image/jpeg', 0.5));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const validarPlacaFormato = (val: string) => {
    setPlacaVehiculo(val);
    const regex = /^[A-Z0-9]{3}-?[A-Z0-9]{3,4}$/i;
    if (val && !regex.test(val.trim())) {
      setErrorPlaca('Formato de placa inválido (Ej: AB123CD)');
    } else {
      setErrorPlaca('');
    }
  };

  const manejarClicEnMapa = async (lat: number, lng: number) => {
    if (!modoSeleccionMapa) return;
    const tipoActual = modoSeleccionMapa;
    setErrorGeocoding('');
    setErrorRuta('');
    if (debounceTimerRef.current[tipoActual]) clearTimeout(debounceTimerRef.current[tipoActual]!);
    geocodingControllerRef.current[tipoActual]?.abort();
    setBuscandoDireccion(current => ({ ...current, [tipoActual]: false }));
    setModoSeleccionMapa(null);
    setDistanciaKm(0);
    setTiempoEstimadoMin(0);

    if (tipoActual === 'origen') {
      setCoordsOrigen({ lat, lng });
      setOrigenInput('Buscando lugar...');
      setReferenciaOrigen('');
    } else {
      setCoordsDestino({ lat, lng });
      setDestinoInput('Buscando lugar...');
      setReferenciaDestino('');
    }

    const controller = new AbortController();
    geocodingControllerRef.current[tipoActual] = controller;
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        radius: '0.5',
        limit: '1'
      });
      const res = await fetch(`https://photon.komoot.io/reverse?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Photon respondió HTTP ${res.status}`);
      const data = await res.json();
      const propiedades = data?.features?.[0]?.properties as PropiedadesPhoton | undefined;
      const nombreLugar = propiedades
        ? formatearDireccionPhoton(propiedades)
        : '';
      const nombreFinal = nombreLugar || `Ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      if (!nombreLugar) {
        setErrorGeocoding('No se encontró el nombre de este lugar; conservamos la ubicación exacta del pin.');
      }

      if (tipoActual === 'origen') setOrigenInput(nombreFinal);
      else setDestinoInput(nombreFinal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Error buscando el nombre del punto con Photon:', error);
      setErrorGeocoding('No se pudo obtener el nombre del punto; conservamos la ubicación exacta del pin.');
      const fallback = `Ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      if (tipoActual === 'origen') setOrigenInput(fallback);
      else setDestinoInput(fallback);
    }
  };

  const obtenerUbicacionActual = (objetivo: 'origen' | 'destino' | null = null) => {
    objetivoUbicacionRef.current = objetivo;
    setErrorUbicacion('');
    setErrorRuta('');
    if (objetivo) {
      if (debounceTimerRef.current[objetivo]) clearTimeout(debounceTimerRef.current[objetivo]!);
      geocodingControllerRef.current[objetivo]?.abort();
      setBuscandoDireccion(current => ({ ...current, [objetivo]: false }));
    }

    if (!navigator.geolocation) {
      setErrorUbicacion('Este dispositivo o navegador no permite acceder a la ubicación.');
      return;
    }

    setUbicacionCargando(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ubicacion = { lat: coords.latitude, lng: coords.longitude };
        setCoordsUsuarioGPS(ubicacion);
        setRecentrarMapa(value => value + 1);

        if (objetivoUbicacionRef.current === 'origen') {
          setDistanciaKm(0);
          setTiempoEstimadoMin(0);
          setCoordsOrigen(ubicacion);
          setOrigenInput('Mi ubicación actual');
          setReferenciaOrigen('');
          setSugerenciasOrigen([]);
        } else if (objetivoUbicacionRef.current === 'destino') {
          setDistanciaKm(0);
          setTiempoEstimadoMin(0);
          setCoordsDestino(ubicacion);
          setDestinoInput('Mi ubicación actual');
          setReferenciaDestino('');
          setSugerenciasDestino([]);
        }

        setUbicacionCargando(false);
      },
      (error) => {
        const mensaje = error.code === error.PERMISSION_DENIED
          ? 'Permite el acceso a la ubicación en los permisos de la app o del navegador y vuelve a intentarlo.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'No se pudo obtener tu ubicación. Activa el GPS o los servicios de ubicación del dispositivo.'
            : 'La solicitud de ubicación tardó demasiado. Comprueba el GPS e inténtalo de nuevo.';
        setErrorUbicacion(mensaje);
        setUbicacionCargando(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const buscarDireccionGeocoding = (query: string, tipo: 'origen' | 'destino') => {
    const setInput = tipo === 'origen' ? setOrigenInput : setDestinoInput;
    const setCoords = tipo === 'origen' ? setCoordsOrigen : setCoordsDestino;
    const setSugerencias = tipo === 'origen' ? setSugerenciasOrigen : setSugerenciasDestino;
    const setReferencia = tipo === 'origen' ? setReferenciaOrigen : setReferenciaDestino;
    setInput(query);
    setCoords(null);
    setSugerencias([]);
    setReferencia('');
    setErrorGeocoding('');
    setErrorRuta('');
    setBuscandoDireccion(current => ({ ...current, [tipo]: query.trim().length >= 3 }));
    setDistanciaKm(0);
    setTiempoEstimadoMin(0);

    if (debounceTimerRef.current[tipo]) clearTimeout(debounceTimerRef.current[tipo]!);
    geocodingControllerRef.current[tipo]?.abort();

    const consulta = query.trim();
    if (consulta.length < 3) {
      return;
    }

    debounceTimerRef.current[tipo] = setTimeout(async () => {
      const controller = new AbortController();
      geocodingControllerRef.current[tipo] = controller;
      try {
        const proximidad = coordsUsuarioGPS || { lat: 10.2291, lng: -68.0055 };
        const params = new URLSearchParams({
          q: consulta,
          lat: String(proximidad.lat),
          lon: String(proximidad.lng),
          bbox: '-68.4,10.0,-67.7,10.5',
          limit: '8'
        });
        const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Photon respondió HTTP ${response.status}`);

        const data = await response.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        const formatted: SugerenciaDireccion[] = features.flatMap((feature: {
          properties?: PropiedadesPhoton;
          geometry?: { coordinates?: unknown };
        }) => {
          const coordinates = feature.geometry?.coordinates;
          if (!Array.isArray(coordinates)
            || typeof coordinates[0] !== 'number'
            || typeof coordinates[1] !== 'number'
            || !Number.isFinite(coordinates[0])
            || !Number.isFinite(coordinates[1])) return [];
          const properties = feature.properties || {};
          const displayName = formatearDireccionPhoton(properties);
          if (!displayName) return [];
          return [{
            display_name: displayName,
            lon: coordinates[0],
            lat: coordinates[1],
            tipo: tipoDireccionPhoton(properties)
          }];
        });

        if (tipo === 'origen') setSugerenciasOrigen(formatted);
        else setSugerenciasDestino(formatted);
        setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error buscando dirección en Photon:', error);
        setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
        setErrorGeocoding('No se pudieron buscar lugares en OpenStreetMap. Puedes marcar el punto exacto en el mapa.');
      }
    }, 500);
  };

  const seleccionarSugerencia = (item: SugerenciaDireccion, tipo: 'origen' | 'destino') => {
    if (debounceTimerRef.current[tipo]) clearTimeout(debounceTimerRef.current[tipo]!);
    geocodingControllerRef.current[tipo]?.abort();
    setErrorGeocoding('');
    setErrorRuta('');
    setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
    setDistanciaKm(0);
    setTiempoEstimadoMin(0);
    if (tipo === 'origen') {
      setOrigenInput(item.display_name);
      setCoordsOrigen({ lat: item.lat, lng: item.lon });
      setReferenciaOrigen('');
      setSugerenciasOrigen([]);
    } else {
      setDestinoInput(item.display_name);
      setCoordsDestino({ lat: item.lat, lng: item.lon });
      setReferenciaDestino('');
      setSugerenciasDestino([]);
    }
  };

  const cargarConfiguracionPago = async () => {
    if (!usuario) return;
    setCargandoConfiguracionPago(true);
    setErrorPago('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pagos/config`);
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo cargar la información de pago'));
      const data: ConfiguracionPago = await response.json();
      setConfiguracionPago(data);
    } catch (error) {
      setErrorPago(error instanceof Error ? error.message : 'No se pudo cargar la información de pago.');
    } finally {
      setCargandoConfiguracionPago(false);
    }
  };

  const cargarPanelAdmin = async () => {
    if (!usuario?.es_admin) return;
    setCargandoAdmin(true);
    setErrorAdmin('');
    try {
      const [pagosResponse, configResponse] = await Promise.all([
        authenticatedFetch(`${API_URL}/api/pagos/admin/pendientes`),
        authenticatedFetch(`${API_URL}/api/pagos/config`)
      ]);
      if (!pagosResponse.ok) throw new Error(await mensajeErrorApi(pagosResponse, 'No se pudieron cargar los pagos pendientes'));
      if (!configResponse.ok) throw new Error(await mensajeErrorApi(configResponse, 'No se pudo cargar la configuración de pago'));
      const pagosData = await pagosResponse.json();
      const configData: ConfiguracionPago = await configResponse.json();
      setPagosPendientesAdmin(Array.isArray(pagosData.pagos) ? pagosData.pagos : []);
      setConfiguracionPago(configData);
      setConfigPagoAdmin(configData.pagoMovil);
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo cargar el panel de administración.');
    } finally {
      setCargandoAdmin(false);
    }
  };

  const revisarPagoManual = async (pedidoId: number, accion: 'aprobar' | 'rechazar' | 'reembolsar' | 'sin_pago') => {
    const confirmacion = accion === 'rechazar'
      ? '¿Rechazar el pago y cancelar este viaje?'
      : accion === 'reembolsar'
        ? 'Confirma solo después de devolver el dinero al pasajero. ¿Ya realizaste el reembolso?'
        : accion === 'sin_pago' ? '¿Confirmas que no se recibió ningún pago por este viaje cancelado?' : '';
    if (confirmacion && !window.confirm(confirmacion)) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pagos/admin/pedidos/${pedidoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo revisar el pago'));
      await cargarPanelAdmin();
      setMensajeAdmin(
        accion === 'aprobar' ? 'Pago confirmado; el viaje ya puede aparecer en el radar.'
          : accion === 'rechazar' ? 'Pago rechazado y viaje cancelado.'
            : accion === 'reembolsar' ? 'Reembolso registrado.'
              : 'Solicitud cerrada: no se recibió el pago.'
      );
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo revisar el pago.');
    }
  };

  const guardarConfiguracionPagoAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pagos/admin/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPagoAdmin)
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo guardar la configuración'));
      await cargarPanelAdmin();
      setMensajeAdmin('Datos de Pago Móvil guardados.');
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo guardar la configuración.');
    }
  };

  const recargarSaldoCorporativo = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pagos/admin/saldo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailRecargaSaldo, monto: montoRecargaSaldo, nota: notaRecargaSaldo })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo recargar el saldo'));
      const data = await response.json();
      setEmailRecargaSaldo('');
      setMontoRecargaSaldo('');
      setNotaRecargaSaldo('');
      setErrorAdmin('');
      setMensajeAdmin(`Recarga aplicada. Nuevo saldo: $${Number(data.saldoCorporativo).toFixed(2)}.`);
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo recargar el saldo.');
    }
  };

  const handleCrearPedido = async () => {
    if (!usuario) return;
    if (!rutaCompletaLista || !coordsOrigen || !coordsDestino || distanciaKm <= 0 || tiempoEstimadoMin <= 0) {
      alert('Completa el origen y destino, y espera a que se calcule la ruta.');
      return;
    }
    if (serviceType === 'viajes') {
      if (metodoPagoViaje === 'pago_movil' && !referenciaPago.trim()) {
        alert('Ingresa la referencia del Pago Móvil para enviarlo a revisión.');
        return;
      }
      if (metodoPagoViaje === 'pago_movil'
        && !(configuracionPago?.pagoMovil.banco
          && configuracionPago.pagoMovil.telefono
          && configuracionPago.pagoMovil.cedula
          && configuracionPago.pagoMovil.titular)) {
        alert('Pago Móvil todavía no está configurado por Llévalo. Selecciona otro método o inténtalo luego.');
        return;
      }
      if (metodoPagoViaje === 'saldo_corporativo'
        && (configuracionPago?.saldoCorporativo || 0) < Number(tarifaTotal)) {
        alert('Tu saldo corporativo no es suficiente para este viaje.');
        return;
      }
    }
    setEnviandoPedido(true);

    try {
      const res = await authenticatedFetch(`${API_URL}/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: usuario.id,
          cliente_nombre: usuario.nombre,
          cliente_cedula: usuario.cedula || 'V-00000000',
          cliente_foto: fotoLocal || usuario.foto || '',
          tipo_servicio: serviceType,
          descripcion: serviceType === 'viajes' ? 'Servicio de viaje' : 'Servicio de envíos',
          origen_texto: `${origenInput.trim()}${referenciaOrigen.trim() ? ` | Referencia: ${referenciaOrigen.trim()}` : ''}`.slice(0, 300),
          origen_lat: coordsOrigen.lat, origen_lon: coordsOrigen.lng,
          destino_texto: `${destinoInput.trim()}${referenciaDestino.trim() ? ` | Referencia: ${referenciaDestino.trim()}` : ''}`.slice(0, 300),
          destino_lat: coordsDestino.lat, destino_lon: coordsDestino.lng,
          distancia_km: distanciaKm, tiempo_min: tiempoEstimadoMin, tarifa: tarifaTotal,
          metodo_pago: serviceType === 'viajes' ? metodoPagoViaje : undefined,
          referencia_pago: serviceType === 'viajes' && metodoPagoViaje === 'pago_movil' ? referenciaPago.trim() : undefined
        })
      });
      if (!res.ok) throw new Error(await mensajeErrorApi(res, 'No se pudo publicar el pedido'));
      setOrigenInput(''); setDestinoInput('');
      setReferenciaPago('');
      setReferenciaOrigen(''); setReferenciaDestino('');
      setCoordsOrigen(null); setCoordsDestino(null);
      setDistanciaKm(0); setTiempoEstimadoMin(0);
      setSegundosRestantes(60);
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
    finally { setEnviandoPedido(false); }
  };

  const cancelarPedidoActual = async (pedidoId: number) => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevo_estado: 'cancelado' })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo cancelar el pedido'));
      const data = await response.json();
      setCoordsOrigen(null); setCoordsDestino(null);
      setOrigenInput(''); setDestinoInput('');
      setReferenciaOrigen(''); setReferenciaDestino('');
      setDistanciaKm(0); setTiempoEstimadoMin(0);
      setSugerenciasOrigen([]); setSugerenciasDestino([]);
      await sincronizarDatos();
      if (data.pedido?.estado_pago === 'reembolso_pendiente' || data.pedido?.estado_pago === 'reembolsado') {
        window.alert(data.mensaje);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo cancelar el pedido.');
    }
  };

  const postularsePedido = async (pedidoId: number) => {
    if (!usuario) return;
    try {
      const res = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/postular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repartidor_id: usuario.id, repartidor_nombre: usuario.nombre,
          vehiculo: usuario.vehiculo || 'Moto Suzuki GN', placa: usuario.placa || 'ABC-123',
          vehiculo_foto: fotoVehiculoLocal || usuario.vehiculo_foto || '', calificacion: usuario.calificacion || 4.9
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
  };

  const cancelarPostulacionEnServidor = async (pedidoId: number) => {
    if (!usuario || usuario.rol !== 'repartidor') throw new Error('Inicia sesión como repartidor para cancelar la postulación.');
    const response = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/postular/${usuario.id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo cancelar la postulación'));
  };

  const cancelarPostulacion = async (pedidoId: number) => {
    try {
      await cancelarPostulacionEnServidor(pedidoId);
      await sincronizarDatos();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al cancelar postulación');
    }
  };

  const aceptarPostulacion = async (pedidoId: number, post: Postulacion) => {
    try {
      const res = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/aceptar-postulacion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repartidor_id: post.repartidor_id, repartidor_nombre: post.repartidor_nombre,
          vehiculo: post.vehiculo, placa: post.placa, vehiculo_foto: post.vehiculo_foto || '', calificacion: post.calificacion || 4.9
        })
      });
      if (!res.ok) throw new Error(await mensajeErrorApi(res, 'No se pudo aceptar la postulación'));
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
  };

  const enviarMensaje = async (pedidoId: number) => {
    if (!usuario || !nuevoMensajeTexto.trim()) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remitente_id: usuario.id, remitente_nombre: usuario.nombre, mensaje: nuevoMensajeTexto })
      });
      if (!response.ok) throw new Error('No se pudo enviar el mensaje.');
      setNuevoMensajeTexto('');
      await sincronizarDatos();
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      alert(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    }
  };

  const cambiarEstadoPedido = async (pedidoId: number, nuevoEstado: 'entregado_repartidor' | 'completado' | 'cancelado') => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevo_estado: nuevoEstado })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo actualizar el estado del pedido'));
      if (nuevoEstado === 'completado') {
        setCoordsOrigen(null); setCoordsDestino(null);
        setOrigenInput(''); setDestinoInput('');
      }
      await sincronizarDatos();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo actualizar el estado del pedido.');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'register' && !passwordCompleta) {
      alert('Por favor cumple con todos los requisitos de seguridad para la contraseña.');
      return;
    }
    if (errorPlaca) {
      alert('Por favor corrige los errores en la placa antes de continuar.');
      return;
    }
    setErrorAuth('');

    const cedulaCompleta = `V-${cedulaNumero.trim()}`;

    const payload = authMode === 'login' 
      ? { email, password }
      : { 
          nombre, email, telefono, 
          cedula: cedulaNumero ? cedulaCompleta : 'V-00000000', foto: fotoLocal, 
          vehiculo: tipoVehiculo, placa: placaVehiculo || 'ABC-123', 
          vehiculo_foto: fotoVehiculoLocal, calificacion: 4.9,
          password, rol: authRoleSelection 
        };

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en autenticación');

      localStorage.setItem('llevalo_token', data.token);
      localStorage.setItem('llevalo_usuario', JSON.stringify(data.usuario));
      setUsuario(data.usuario);
      setCedulaNumero(data.usuario.cedula?.replace(/^[VvEe]-/, '') || '');
      setFotoLocal(data.usuario.foto || '');
      setTipoVehiculo(data.usuario.vehiculo || 'Moto Suzuki GN 125');
      setPlacaVehiculo(data.usuario.placa || '');
      setActiveTab('home');
    } catch (err: any) {
      setErrorAuth(err.message);
    }
  };

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario) return;
    setGuardandoPerfil(true);
    setErrorPerfil('');
    const cedulaCompleta = `V-${cedulaNumero.trim()}`;
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cedula: cedulaCompleta,
          foto: fotoLocal,
          ...(usuario.rol === 'repartidor' ? {
            vehiculo: tipoVehiculo,
            placa: placaVehiculo,
            vehiculo_foto: fotoVehiculoLocal
          } : {})
        })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo guardar el perfil'));
      const data = await response.json();
      const actualizado: UsuarioSesion = data.usuario;
      setUsuario(actualizado);
      localStorage.setItem('llevalo_usuario', JSON.stringify(actualizado));
      setActiveTab(usuario.rol === 'cliente' ? 'cliente' : 'repartidor');
    } catch (error) {
      setErrorPerfil(error instanceof Error ? error.message : 'No se pudo guardar el perfil.');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('llevalo_token');
    localStorage.removeItem('llevalo_usuario');
    setUsuario(null);
    setActiveTab('home');
  };

  const pedidoActivoCliente = usuario?.rol === 'cliente' && Array.isArray(pedidosReales)
    ? pedidosReales.find(p => p.cliente_id === usuario.id && p.estado !== 'completado' && p.estado !== 'cancelado')
    : null;

  const postulacionesPedidoActual = pedidoActivoCliente && Array.isArray(postulacionesReales)
    ? postulacionesReales.filter(p => p.pedido_id === pedidoActivoCliente.id) 
    : [];

  const pedidosVisiblesRepartidor = usuario?.rol === 'repartidor' && Array.isArray(pedidosReales)
    ? pedidosReales.filter(p => p.estado === 'pendiente' || p.estado === 'postulado' || (p.estado === 'aceptado' && p.repartidor_id === usuario.id) || (p.estado === 'entregado_repartidor' && p.repartidor_id === usuario.id))
    : [];

  const pedidoAsignadoRepartidor = usuario?.rol === 'repartidor' && Array.isArray(pedidosReales)
    ? pedidosReales.find(p => p.repartidor_id === usuario.id && (p.estado === 'aceptado' || p.estado === 'entregado_repartidor'))
    : null;
  const pedidoAsignadoRepartidorId = pedidoAsignadoRepartidor?.id;
  const postulacionesPendientesRepartidor = usuario?.rol === 'repartidor'
    ? postulacionesReales.filter(p => p.repartidor_id === usuario.id && p.estado === 'pendiente')
    : [];
  const pagoViajeCompleto = serviceType !== 'viajes'
    || metodoPagoViaje === 'efectivo'
    || (metodoPagoViaje === 'pago_movil'
      && Boolean(configuracionPago?.pagoMovil.banco
        && configuracionPago.pagoMovil.telefono
        && configuracionPago.pagoMovil.cedula
        && configuracionPago.pagoMovil.titular)
      && Boolean(referenciaPago.trim()))
    || (metodoPagoViaje === 'saldo_corporativo'
      && (configuracionPago?.saldoCorporativo || 0) >= Number(tarifaTotal));

  const cambiarEstadoRepartidor = async () => {
    if (!usuario || usuario.rol !== 'repartidor' || cambiandoEstadoRepartidor) return;
    if (!repartidorOnline) {
      setRepartidorOnline(true);
      return;
    }
    if (pedidoAsignadoRepartidor) {
      alert('No puedes desconectarte mientras tienes una entrega activa.');
      return;
    }

    if (postulacionesPendientesRepartidor.length > 0) {
      const confirmacion = window.confirm(
        `Al desconectarte se cancelarán tus ${postulacionesPendientesRepartidor.length} postulaciones pendientes. ¿Deseas continuar?`
      );
      if (!confirmacion) return;
    }

    setCambiandoEstadoRepartidor(true);
    try {
      for (const postulacion of postulacionesPendientesRepartidor) {
        await cancelarPostulacionEnServidor(postulacion.pedido_id);
      }
      if (postulacionesPendientesRepartidor.length > 0) await sincronizarDatos();
      setRepartidorOnline(false);
    } catch (error) {
      await sincronizarDatos();
      alert(error instanceof Error ? error.message : 'No se pudo cancelar las postulaciones.');
    } finally {
      setCambiandoEstadoRepartidor(false);
    }
  };

  useEffect(() => {
    if (usuario?.rol !== 'repartidor' || !pedidoAsignadoRepartidorId || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setCoordsUsuarioGPS({ lat: coords.latitude, lng: coords.longitude });
        setErrorUbicacion('');
      },
      (error) => {
        setErrorUbicacion(error.code === error.PERMISSION_DENIED
          ? 'Activa el permiso de ubicación para compartir tu posición durante una entrega.'
          : 'No se pudo actualizar tu ubicación. Comprueba que el GPS esté activo.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [usuario?.id, usuario?.rol, pedidoAsignadoRepartidorId]);

  useEffect(() => {
    if (usuario?.rol !== 'repartidor' || !pedidoAsignadoRepartidorId || !coordsUsuarioGPS) return;

    authenticatedFetch(`${API_URL}/api/pedidos/${pedidoAsignadoRepartidorId}/ubicacion-repartidor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: coordsUsuarioGPS.lat, lon: coordsUsuarioGPS.lng })
    }).then((response) => {
      if (!response.ok) console.error('No se pudo guardar la ubicación del repartidor.');
    }).catch((error) => console.error('Error enviando ubicación del repartidor:', error));
  }, [coordsUsuarioGPS, usuario?.rol, pedidoAsignadoRepartidorId]);

  return (
    <div className={`app-shell flex flex-col font-sans transition-colors duration-300 ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#FDFBF7] text-slate-800'}`}>
      <header className={`border-b backdrop-blur sticky top-0 z-50 px-4 md:px-10 py-3 flex flex-wrap justify-between items-center gap-y-2 shadow-sm transition-colors ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-[#FDFBF7]/90 border-orange-100'}`}>
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('home')}>
          <div className="bg-[#FF5722] text-white w-9 h-9 rounded-2xl font-black text-lg flex items-center justify-center shadow-md">L</div>
          <span className={`text-xl md:text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Llévalo</span>
        </div>
        
        <nav className={`hidden md:flex space-x-2 p-1.5 rounded-2xl border ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-orange-50/80 border-orange-100'}`}>
          <button onClick={() => setActiveTab('home')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'home' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>{usuario ? 'Mi Panel' : 'Inicio'}</button>
          {usuario && usuario.rol === 'cliente' && <button onClick={() => setActiveTab('cliente')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'cliente' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Pedir</button>}
          {usuario && usuario.rol === 'repartidor' && <button onClick={() => setActiveTab('repartidor')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'repartidor' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Radar de Trabajos</button>}
          {usuario?.es_admin && <button onClick={() => { setActiveTab('admin'); void cargarPanelAdmin(); }} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'admin' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Administración</button>}
        </nav>

        <div className="flex items-center space-x-2 md:space-x-3">
          <div className={`hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl border text-[11px] md:text-xs font-bold shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-orange-50 border-orange-200 text-slate-700'}`}>
            <DollarSign size={13} className="text-[#FF5722]" />
            <span>BCV: <strong>Bs. {tasaBCV}</strong></span>
          </div>

          {usuario ? (
            <div className={`flex items-center space-x-2 border px-2.5 py-1 rounded-2xl shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
              {fotoLocal ? (
                <img src={fotoLocal} alt="Avatar" className="w-8 h-8 rounded-full object-cover border-2 border-[#FF5722]" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-orange-100 text-[#FF5722] flex items-center justify-center font-bold text-xs">
                  {usuario.nombre ? usuario.nombre.substring(0, 2).toUpperCase() : 'U'}
                </div>
              )}
              <div className="text-right hidden sm:block cursor-pointer" onClick={() => setActiveTab('perfil')}>
                <p className={`text-xs font-black hover:underline ${darkMode ? 'text-white' : 'text-slate-900'}`}>{usuario.nombre}</p>
                <p className="text-[10px] font-bold text-[#FF5722] uppercase">{usuario.rol} · Mi Perfil</p>
              </div>
              {usuario.es_admin && <button onClick={() => { setActiveTab('admin'); void cargarPanelAdmin(); }} className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] font-bold text-[#FF5722] md:hidden">Admin</button>}
              <button onClick={handleLogout} className="text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/35 px-2 py-1 rounded-xl border border-red-200 cursor-pointer">Salir</button>
            </div>
          ) : (
            <button onClick={() => { setErrorAuth(''); setActiveTab('auth'); }} className={`flex items-center space-x-1.5 border px-4 py-2 rounded-2xl transition text-xs md:text-sm font-bold shadow-sm cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800' : 'bg-white hover:bg-orange-50 border-orange-200 text-slate-800'}`}>
              <User size={16} className="text-[#FF5722]" />
              <span>Ingresar</span>
            </button>
          )}
        </div>

        {usuario && (
          <nav aria-label="Navegación móvil" className={`flex w-full flex-wrap items-center gap-2 md:hidden ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
            <button type="button" aria-pressed={activeTab === 'home'} onClick={() => setActiveTab('home')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'home' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
              <MapPin size={17} /> Inicio
            </button>
            {usuario.rol === 'cliente' ? (
              <button type="button" aria-pressed={activeTab === 'cliente'} onClick={() => setActiveTab('cliente')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'cliente' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <Package size={17} /> Pedir
              </button>
            ) : (
              <button type="button" aria-pressed={activeTab === 'repartidor'} onClick={() => setActiveTab('repartidor')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'repartidor' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <Bike size={17} /> Radar
              </button>
            )}
            {usuario.es_admin && (
              <button type="button" aria-pressed={activeTab === 'admin'} onClick={() => { setActiveTab('admin'); void cargarPanelAdmin(); }} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'admin' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <DollarSign size={17} /> Admin
              </button>
            )}
            <button type="button" aria-pressed={activeTab === 'perfil'} onClick={() => setActiveTab('perfil')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'perfil' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
              <User size={17} /> Perfil
            </button>
          </nav>
        )}
      </header>

      <main className="flex-1 flex flex-col p-4 md:p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'home' && !usuario && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-8 lg:py-14">
            <div className="space-y-6">
              <div className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase border ${darkMode ? 'bg-orange-950/60 border-orange-900 text-orange-300' : 'bg-orange-100 border-orange-200 text-[#FF5722]'}`}>
                <MapPin size={14} className="text-[#FF5722]" />
                <span>San Diego, Carabobo, Venezuela 🇻🇪</span>
              </div>
              <h1 className={`text-4xl lg:text-7xl font-black tracking-tight leading-[1.08] ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Lo que necesites, <span className="text-[#FF5722]">llévalo ya.</span>
              </h1>
              <p className={`text-base lg:text-lg leading-relaxed max-w-xl ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Envíos y viajes en San Diego. Conoce quién realizará el servicio y sigue cada solicitud desde la app.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button onClick={() => { setAuthRoleSelection('cliente'); setActiveTab('auth'); }} className="bg-[#FF5722] hover:bg-[#F4511E] text-white font-bold px-8 py-4 rounded-2xl transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer">
                  <span>Hacer un pedido</span>
                  <ArrowRight size={18} />
                </button>
                <button onClick={() => { setAuthRoleSelection('repartidor'); setActiveTab('auth'); }} className={`border font-bold px-8 py-4 rounded-2xl transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800' : 'bg-white hover:bg-orange-50 border-orange-200 text-slate-800'}`}>
                  <Bike size={18} className="text-[#FF5722]" />
                  <span>Quiero ser repartidor</span>
                </button>
              </div>
            </div>

            {/* Imagen exacta apuntando al archivo local /hero-moto.jpg */}
            <div className="relative">
              <div className={`rounded-3xl overflow-hidden shadow-xl border p-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-orange-100 border-orange-200'}`}>
                <img src="/hero-moto.jpg" alt="Repartidor de Llévalo en moto" className="rounded-2xl object-cover w-full h-[420px]" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'home' && usuario && (
          <section className="w-full max-w-5xl mx-auto py-6 md:py-12 space-y-6">
            <div className={`rounded-3xl p-6 md:p-10 border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#FF5722]">
                    <MapPin size={14} /> Llévalo · San Diego
                  </span>
                  <h1 className={`text-3xl md:text-5xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    ¡Hola, {usuario.nombre.split(' ')[0]}!
                  </h1>
                  <p className={`text-sm md:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {usuario.rol === 'cliente'
                      ? '¿Qué necesitas hoy? Pide algo y nosotros lo llevamos.'
                      : 'Tu próximo trabajo está a un toque. Revisa el radar y mantente disponible.'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  {usuario.rol === 'cliente' ? (
                    <button onClick={() => setActiveTab('cliente')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF5722] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#F4511E]">
                      Hacer un pedido <ArrowRight size={17} />
                    </button>
                  ) : (
                    <button onClick={() => setActiveTab('repartidor')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF5722] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#F4511E]">
                      <Bike size={17} /> Abrir radar
                    </button>
                  )}
                  <button onClick={() => setActiveTab('perfil')} className={`rounded-2xl border px-6 py-3.5 text-sm font-bold transition ${darkMode ? 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700' : 'border-orange-200 bg-orange-50 text-slate-800 hover:bg-orange-100'}`}>
                    Mi perfil
                  </button>
                </div>
              </div>
            </div>

            {usuario.rol === 'cliente' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <button onClick={() => setActiveTab('cliente')} className={`rounded-3xl border p-6 text-left transition hover:-translate-y-0.5 ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-orange-700' : 'bg-white border-orange-100 hover:border-orange-300'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-[#FF5722]"><Package size={20} /></div>
                  <h2 className="font-black">Solicitar un envío</h2>
                  <p className="mt-2 text-xs text-slate-500">Indica origen y destino, y sigue tu solicitud desde aquí.</p>
                </button>
                <div className={`rounded-3xl border p-6 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Clock size={20} /></div>
                  <h2 className="font-black">Tu servicio</h2>
                  <p className="mt-2 text-xs text-slate-500">
                    {pedidoActivoCliente
                      ? `Pedido ${pedidoActivoCliente.estado}: ${pedidoActivoCliente.descripcion}`
                      : 'Todavía no tienes pedidos activos. Cuando hagas uno, su estado aparecerá aquí.'}
                  </p>
                  {pedidoActivoCliente && <button onClick={() => setActiveTab('cliente')} className="mt-4 text-xs font-bold text-[#FF5722] hover:underline">Ver pedido y seguimiento</button>}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className={`rounded-3xl border p-6 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Bike size={20} /></div>
                  <h2 className="font-black">{pedidoAsignadoRepartidor ? 'Entrega en curso' : 'Trabaja con Llévalo'}</h2>
                  <p className="mt-2 text-xs text-slate-500">
                    {pedidoAsignadoRepartidor
                      ? `${pedidoAsignadoRepartidor.origen_texto} → ${pedidoAsignadoRepartidor.destino_texto}`
                      : 'Consulta los pedidos disponibles y postúlate a los que te convengan.'}
                  </p>
                </div>
                <div className={`rounded-3xl border p-6 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-[#FF5722]"><MapPin size={20} /></div>
                  <h2 className="font-black">Estado de conexión</h2>
                  <p className="mt-2 text-xs text-slate-500">{repartidorOnline ? 'Estás conectado y puedes recibir pedidos.' : 'Estás desconectado y no recibirás nuevas solicitudes.'}</p>
                  <button onClick={() => setActiveTab('repartidor')} className="mt-4 text-xs font-bold text-[#FF5722] hover:underline">Ir al radar de trabajos</button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'auth' && (
          <div className="max-w-md mx-auto w-full py-8">
            <div className={`border p-6 md:p-8 rounded-3xl shadow-sm space-y-6 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
              <div className="text-center space-y-1">
                <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{authMode === 'login' ? '¡Bienvenido de nuevo!' : 'Crea tu cuenta'}</h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Accede a Llévalo en Carabobo</p>
              </div>

              {authMode === 'register' && (
                <div className={`flex p-1 rounded-2xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-100'}`}>
                  <button type="button" onClick={() => setAuthRoleSelection('cliente')} className={`flex-1 py-2 text-xs font-bold rounded-xl cursor-pointer ${authRoleSelection === 'cliente' ? 'bg-[#FF5722] text-white' : (darkMode ? 'text-slate-400' : 'text-slate-600')}`}>Cliente</button>
                  <button type="button" onClick={() => setAuthRoleSelection('repartidor')} className={`flex-1 py-2 text-xs font-bold rounded-xl cursor-pointer ${authRoleSelection === 'repartidor' ? 'bg-[#FF5722] text-white' : (darkMode ? 'text-slate-400' : 'text-slate-600')}`}>Repartidor</button>
                </div>
              )}

              {errorAuth && <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl font-bold">{errorAuth}</div>}

              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                {authMode === 'register' && (
                  <>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nombre Completo</label>
                      <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Alirio Pérez" className={`w-full border rounded-xl px-4 py-2 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Teléfono</label>
                      <input type="text" required value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Ej. 04121234567" className={`w-full border rounded-xl px-4 py-2 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Cédula de Identidad</label>
                      <div className="flex mt-1">
                        <span className={`inline-flex items-center px-3 rounded-l-xl border border-r-0 text-xs font-bold ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-orange-100 border-orange-200 text-[#FF5722]'}`}>
                          V-
                        </span>
                        <input type="text" required value={cedulaNumero} onChange={e => setCedulaNumero(e.target.value.replace(/\D/g, ''))} placeholder="28123456" maxLength={8} className={`w-full border rounded-r-xl px-4 py-2 text-sm ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Correo Electrónico</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" className={`w-full border rounded-xl px-4 py-2 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                </div>

                <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Contraseña</label>
                  <div className="relative mt-1">
                    <input type={mostrarPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={`w-full border rounded-xl px-4 py-2 text-sm pr-10 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    <button type="button" onClick={() => setMostrarPassword(!mostrarPassword)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                      {mostrarPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  
                  {authMode === 'register' && (
                    <div className="mt-2.5 p-2.5 rounded-xl border space-y-1.5 text-[11px] bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                      <p className="font-bold text-slate-500 mb-1">Requisitos de seguridad:</p>
                      <div className={`flex items-center space-x-1.5 ${tieneMinLength ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        {tieneMinLength ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                        <span>Mínimo 8 caracteres</span>
                      </div>
                      <div className={`flex items-center space-x-1.5 ${tieneMayuscula ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        {tieneMayuscula ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                        <span>Al menos una letra mayúscula (A-Z)</span>
                      </div>
                      <div className={`flex items-center space-x-1.5 ${tieneMinuscula ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        {tieneMinuscula ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                        <span>Al menos una letra minúscula (a-z)</span>
                      </div>
                      <div className={`flex items-center space-x-1.5 ${tieneNumero ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        {tieneNumero ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                        <span>Al menos un número (0-9)</span>
                      </div>
                      <div className={`flex items-center space-x-1.5 ${tieneSigno ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        {tieneSigno ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                        <span>Al menos un signo o carácter especial (!@#$...)</span>
                      </div>
                    </div>
                  )}
                </div>

                <button type="submit" disabled={authMode === 'register' && !passwordCompleta} className={`w-full font-bold py-3 rounded-2xl transition shadow-md cursor-pointer mt-2 ${authMode === 'register' && !passwordCompleta ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white'}`}>
                  {authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
                </button>
              </form>

              <div className="text-center pt-2">
                <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-xs font-bold text-[#FF5722] hover:underline cursor-pointer">
                  {authMode === 'login' ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- VISTA CLIENTE --- */}
        {activeTab === 'cliente' && usuario?.rol === 'cliente' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-4 items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className={`border p-6 rounded-3xl shadow-sm space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
                <div className="flex justify-between items-center">
                  <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Nuevo Pedido</h3>
                </div>

                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                  <button type="button" onClick={() => setServiceType('envios')} className={`rounded-2xl border p-4 text-left transition cursor-pointer ${serviceType === 'envios' ? 'border-[#FF5722] bg-orange-50 shadow-sm dark:bg-orange-950/30' : 'border-slate-200 bg-white hover:border-orange-200 dark:border-slate-800 dark:bg-slate-950'}`}>
                    <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${serviceType === 'envios' ? 'bg-[#FF5722] text-white' : 'bg-orange-100 text-[#FF5722]'}`}><Package size={19} /></span>
                    <span className={`block text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Envíos</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">Comida, mercado, paquetes y mandados</span>
                  </button>
                  <button type="button" onClick={() => { setServiceType('viajes'); void cargarConfiguracionPago(); }} className={`rounded-2xl border p-4 text-left transition cursor-pointer ${serviceType === 'viajes' ? 'border-[#FF5722] bg-orange-50 shadow-sm dark:bg-orange-950/30' : 'border-slate-200 bg-white hover:border-orange-200 dark:border-slate-800 dark:bg-slate-950'}`}>
                    <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${serviceType === 'viajes' ? 'bg-[#FF5722] text-white' : 'bg-orange-100 text-[#FF5722]'}`}><CarFront size={19} /></span>
                    <span className={`block text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Viajes</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">Traslados seguros punto a punto</span>
                  </button>
                </div>

                {pedidoActivoCliente ? (
                  <div className="space-y-4 pt-2">
                    <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase text-amber-600 dark:text-amber-400">Estado del servicio en curso</span>
                        <span className="text-xs font-bold text-slate-500">${pedidoActivoCliente.tarifa}</span>
                      </div>
                      <p className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{pedidoActivoCliente.descripcion}</p>
                      <p className="text-[11px] text-slate-500 font-medium">Estado: <strong className="uppercase text-[#FF5722]">{pedidoActivoCliente.estado}</strong></p>
                      {pedidoActivoCliente.tipo_servicio === 'viajes' && (
                        <div className={`rounded-xl border p-3 text-[11px] ${pedidoActivoCliente.estado_pago === 'pagado' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'}`}>
                          <p><strong>{etiquetaMetodoPago(pedidoActivoCliente.metodo_pago)}</strong> · {pedidoActivoCliente.estado_pago === 'pagado' ? 'Pago confirmado' : 'Pago pendiente'}</p>
                          {pedidoActivoCliente.estado_pago === 'pendiente' && pedidoActivoCliente.metodo_pago === 'pago_movil' && <p className="mt-1">Un administrador verificará la referencia antes de publicar el viaje en el radar.</p>}
                          {pedidoActivoCliente.estado_pago === 'pendiente' && pedidoActivoCliente.metodo_pago === 'efectivo' && <p className="mt-1">Paga al conductor en el punto de partida antes de iniciar.</p>}
                        </div>
                      )}

                      {pedidoActivoCliente.estado === 'postulado' && (
                        <button onClick={() => cancelarPedidoActual(pedidoActivoCliente.id)} className="mt-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer">
                          Cancelar pedido
                        </button>
                      )}

                      {pedidoActivoCliente.estado === 'pendiente' && (
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-600">
                            <Clock size={14} className="animate-spin" />
                            <span>Buscando repartidor... ({segundosRestantes}s)</span>
                          </div>
                          <button onClick={() => cancelarPedidoActual(pedidoActivoCliente.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer">
                            Cancelar Pedido
                          </button>
                        </div>
                      )}
                    </div>

                    {pedidoActivoCliente.estado === 'postulado' && postulacionesPedidoActual.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Postulaciones de Repartidores</h4>
                        {postulacionesPedidoActual.map(post => (
                          <div key={post.id} className={`p-3 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50/50 border-orange-200'}`}>
                            <div className="flex items-center space-x-2.5">
                              <div className="w-9 h-9 rounded-full bg-orange-200 text-[#FF5722] flex items-center justify-center font-bold text-xs">
                                {post.repartidor_nombre.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className={`text-xs font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{post.repartidor_nombre}</p>
                                <p className="text-[10px] text-slate-500">{post.vehiculo} · Placa: {post.placa}</p>
                                <div className="flex items-center space-x-1 text-[10px] text-amber-500 font-bold">
                                  <Star size={11} fill="currentColor" />
                                  <span>{post.calificacion}</span>
                                </div>
                              </div>
                            </div>
                            <button onClick={() => aceptarPostulacion(pedidoActivoCliente.id, post)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer shadow-sm">
                              Aceptar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {(pedidoActivoCliente.estado === 'aceptado' || pedidoActivoCliente.estado === 'entregado_repartidor') && (
                      <div className="space-y-4 pt-2">
                        <div className={`p-4 rounded-2xl border space-y-2 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-emerald-50/50 border-emerald-200'}`}>
                          <div className="flex items-center space-x-3">
                            {pedidoActivoCliente.repartidor_foto ? (
                              <img src={pedidoActivoCliente.repartidor_foto} alt="Repartidor" className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                                {pedidoActivoCliente.repartidor_nombre?.[0] || 'R'}
                              </div>
                            )}
                            <div>
                              <p className={`text-xs font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{pedidoActivoCliente.repartidor_nombre}</p>
                              <p className="text-[10px] text-slate-500">{pedidoActivoCliente.repartidor_vehiculo} · Placa: {pedidoActivoCliente.repartidor_placa}</p>
                              <p className="text-[10px] font-bold text-emerald-600 flex items-center space-x-1 mt-0.5">
                                <Navigation size={11} className="animate-pulse" />
                                <span>{pedidoActivoCliente.tipo_servicio === 'viajes' ? 'Conductor en camino a tu ubicación' : 'Repartidor en camino a retirar'}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {pedidoActivoCliente.tipo_servicio === 'viajes' && pedidoActivoCliente.estado === 'aceptado' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('¿Cancelar el viaje antes de que inicie?')) {
                                void cancelarPedidoActual(pedidoActivoCliente.id);
                              }
                            }}
                            className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                          >
                            Cancelar viaje antes de iniciar
                          </button>
                        )}

                        {pedidoActivoCliente.tipo_servicio !== 'viajes' && (
                          <>
                            <div className={`border rounded-2xl p-3 space-y-2 h-44 overflow-y-auto ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Chat con Repartidor</p>
                              {mensajesChat.filter(m => m.pedido_id === pedidoActivoCliente.id).map(m => (
                                <div key={m.id} className={`text-xs p-2 rounded-xl max-w-[85%] ${m.remitente_id === usuario.id ? 'bg-[#FF5722] text-white ml-auto' : (darkMode ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800 border')}`}>
                                  <p className="text-[9px] font-bold opacity-75">{m.remitente_nombre}</p>
                                  <p>{m.mensaje}</p>
                                </div>
                              ))}
                            </div>
                            <div className="flex space-x-2">
                              <input type="text" value={nuevoMensajeTexto} onChange={e => setNuevoMensajeTexto(e.target.value)} placeholder="Escribe un mensaje..." className={`flex-1 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                              <button onClick={() => enviarMensaje(pedidoActivoCliente.id)} className="bg-[#FF5722] text-white p-2 rounded-xl cursor-pointer"><Send size={16} /></button>
                            </div>
                          </>
                        )}

                        {pedidoActivoCliente.estado === 'entregado_repartidor' && (
                          <button onClick={() => cambiarEstadoPedido(pedidoActivoCliente.id, 'completado')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-xl transition cursor-pointer shadow-sm">
                            Confirmar Pedido Recibido y Finalizar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{serviceType === 'viajes' ? 'Punto de partida' : 'Origen (Retirada)'}</label>
                      <div className="relative mt-1">
                        <div className="address-controls grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                        <input type="text" value={origenInput} onChange={e => buscarDireccionGeocoding(e.target.value, 'origen')} placeholder="Sector, calle o establecimiento" className={`min-w-0 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                        <button type="button" onClick={() => obtenerUbicacionActual('origen')} disabled={ubicacionCargando} aria-label="Usar mi ubicación como origen" title="Usar mi ubicación como origen" className="px-3 py-2 rounded-xl border text-xs font-bold text-[#FF5722] border-orange-200 bg-orange-50 disabled:opacity-50">
                          <Navigation size={15} />
                        </button>
                        <button type="button" onClick={() => setModoSeleccionMapa('origen')} className={`px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${modoSeleccionMapa === 'origen' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>Mapa</button>
                        </div>
                      {sugerenciasOrigen.length > 0 && (
                        <div className={`absolute left-0 right-0 top-full z-30 mt-1 max-h-36 w-full max-w-full overflow-y-auto rounded-xl border shadow-lg ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                          {sugerenciasOrigen.map((s, idx) => (
                            <button type="button" key={`${s.display_name}-${idx}`} onClick={() => seleccionarSugerencia(s, 'origen')} className={`w-full p-2 text-left text-xs cursor-pointer border-b last:border-0 ${darkMode ? 'hover:bg-slate-800 border-slate-800 text-slate-200' : 'hover:bg-orange-50 border-orange-50 text-slate-700'}`}>
                              <span className="block">{s.display_name}</span>
                              <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">{etiquetasTipoDireccion[s.tipo] || 'Ubicación'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      </div>
                      {buscandoDireccion.origen && <p className="mt-1 text-[10px] text-slate-500">Buscando calles, sectores y establecimientos…</p>}
                      {!buscandoDireccion.origen && origenInput.trim().length >= 3 && sugerenciasOrigen.length === 0 && !errorGeocoding && (
                        <p className="mt-1 text-[10px] text-slate-500">¿No aparece el lugar o establecimiento? Toca “Mapa” para marcarlo y agrega una referencia.</p>
                      )}
                      <input type="text" maxLength={100} value={referenciaOrigen} onChange={e => setReferenciaOrigen(e.target.value)} placeholder="Referencia: urbanización, casa, bloque o apartamento (opcional)" className={`w-full mt-2 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{serviceType === 'viajes' ? 'Destino del viaje' : 'Destino (Entrega)'}</label>
                      <div className="relative mt-1">
                        <div className="address-controls grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                        <input type="text" value={destinoInput} onChange={e => buscarDireccionGeocoding(e.target.value, 'destino')} placeholder="Sector, calle o establecimiento" className={`min-w-0 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                        <button type="button" onClick={() => obtenerUbicacionActual('destino')} disabled={ubicacionCargando} aria-label="Usar mi ubicación como destino" title="Usar mi ubicación como destino" className="px-3 py-2 rounded-xl border text-xs font-bold text-[#FF5722] border-orange-200 bg-orange-50 disabled:opacity-50">
                          <Navigation size={15} />
                        </button>
                        <button type="button" onClick={() => setModoSeleccionMapa('destino')} className={`px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${modoSeleccionMapa === 'destino' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 border-red-200'}`}>Mapa</button>
                        </div>
                      {sugerenciasDestino.length > 0 && (
                        <div className={`absolute left-0 right-0 top-full z-30 mt-1 max-h-36 w-full max-w-full overflow-y-auto rounded-xl border shadow-lg ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                          {sugerenciasDestino.map((s, idx) => (
                            <button type="button" key={`${s.display_name}-${idx}`} onClick={() => seleccionarSugerencia(s, 'destino')} className={`w-full p-2 text-left text-xs cursor-pointer border-b last:border-0 ${darkMode ? 'hover:bg-slate-800 border-slate-800 text-slate-200' : 'hover:bg-orange-50 border-orange-50 text-slate-700'}`}>
                              <span className="block">{s.display_name}</span>
                              <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">{etiquetasTipoDireccion[s.tipo] || 'Ubicación'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      </div>
                      {buscandoDireccion.destino && <p className="mt-1 text-[10px] text-slate-500">Buscando calles, sectores y establecimientos…</p>}
                      {!buscandoDireccion.destino && destinoInput.trim().length >= 3 && sugerenciasDestino.length === 0 && !errorGeocoding && (
                        <p className="mt-1 text-[10px] text-slate-500">¿No aparece el lugar o establecimiento? Toca “Mapa” para marcarlo y agrega una referencia.</p>
                      )}
                      <input type="text" maxLength={100} value={referenciaDestino} onChange={e => setReferenciaDestino(e.target.value)} placeholder="Referencia: urbanización, casa, bloque o apartamento (opcional)" className={`w-full mt-2 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>

                    {errorGeocoding && <p role="alert" className="text-[10px] text-amber-700">{errorGeocoding}</p>}
                    {errorRuta && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{errorRuta}</p>}
                    <p className="text-[9px] text-slate-500">
                      Búsqueda Photon · Datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a>
                    </p>

                    {errorUbicacion && (
                      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                        <p>{errorUbicacion}</p>
                        <button type="button" onClick={() => obtenerUbicacionActual(objetivoUbicacionRef.current)} className="mt-2 font-bold underline">
                          Reintentar ubicación
                        </button>
                      </div>
                    )}

                    {rutaCompletaLista && (
                      <div className={`p-3 rounded-2xl border flex justify-between items-center text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-orange-50/50 border-orange-200 text-slate-700'}`}>
                        <div>
                          <p>Distancia: <strong>{distanciaKm} km</strong></p>
                          <p>Tiempo: <strong>~{tiempoEstimadoMin} min</strong></p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-[#FF5722]">${tarifaTotal}</p>
                          <p className="text-[10px] text-slate-400">Bs. {tarifaEnBolivares}</p>
                        </div>
                      </div>
                    )}

                    {serviceType === 'viajes' && (
                      <div className={`space-y-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-white'}`}>
                        <div>
                          <h4 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Método de pago</h4>
                          <p className="mt-1 text-[10px] text-slate-500">El pago se confirma antes de comenzar el viaje.</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {([
                            ['pago_movil', 'Pago Móvil'],
                            ['efectivo', 'Efectivo'],
                            ['saldo_corporativo', 'Saldo corporativo']
                          ] as const).map(([metodo, etiqueta]) => (
                            <button key={metodo} type="button" aria-pressed={metodoPagoViaje === metodo} onClick={() => setMetodoPagoViaje(metodo)} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${metodoPagoViaje === metodo ? 'border-[#FF5722] bg-orange-50 text-[#D84315] dark:bg-orange-950/30 dark:text-orange-300' : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300'}`}>
                              {etiqueta}
                            </button>
                          ))}
                        </div>

                        {metodoPagoViaje === 'pago_movil' && (
                          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">
                            {cargandoConfiguracionPago && <p className="text-slate-500">Cargando datos de Pago Móvil…</p>}
                            {configuracionPago?.pagoMovil.telefono ? (
                              <div className="space-y-1 text-slate-600 dark:text-slate-300">
                                <p><strong>Banco:</strong> {configuracionPago.pagoMovil.banco}</p>
                                <p><strong>Teléfono:</strong> {configuracionPago.pagoMovil.telefono}</p>
                                <p><strong>Cédula/RIF:</strong> {configuracionPago.pagoMovil.cedula}</p>
                                <p><strong>Titular:</strong> {configuracionPago.pagoMovil.titular}</p>
                                <p className="pt-1 text-[10px] text-amber-700 dark:text-amber-400">Realiza el pago por el monto cotizado y escribe la referencia. Un administrador la verificará antes de ofrecer el viaje.</p>
                              </div>
                            ) : !cargandoConfiguracionPago && (
                              <p className="text-amber-700 dark:text-amber-400">Pago Móvil aún no está configurado. Puedes elegir efectivo o saldo corporativo.</p>
                            )}
                            <input type="text" maxLength={100} value={referenciaPago} onChange={e => setReferenciaPago(e.target.value)} placeholder="Referencia de la operación" className={`w-full rounded-xl border px-3 py-2 ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`} />
                          </div>
                        )}

                        {metodoPagoViaje === 'efectivo' && (
                          <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                            Paga al conductor en el punto de partida. El conductor confirmará que recibió el efectivo antes de iniciar el viaje.
                          </p>
                        )}

                        {metodoPagoViaje === 'saldo_corporativo' && (
                          <p className={`rounded-xl p-3 text-[11px] ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                            Saldo disponible: <strong>${(configuracionPago?.saldoCorporativo || 0).toFixed(2)}</strong>
                            {(configuracionPago?.saldoCorporativo || 0) < Number(tarifaTotal) && <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-400">Solicita una recarga al administrador de tu cuenta.</span>}
                          </p>
                        )}
                        {errorPago && <p role="alert" className="text-[10px] font-semibold text-red-600">{errorPago}</p>}
                      </div>
                    )}

                    <button disabled={!rutaCompletaLista || distanciaKm <= 0 || tiempoEstimadoMin <= 0 || !pagoViajeCompleto || enviandoPedido} onClick={handleCrearPedido} className={`w-full py-3 rounded-xl font-bold text-xs transition cursor-pointer shadow-md ${!rutaCompletaLista || distanciaKm <= 0 || tiempoEstimadoMin <= 0 || !pagoViajeCompleto || enviandoPedido ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white'}`}>
                      {enviandoPedido ? 'Procesando...' : serviceType !== 'viajes' ? 'Publicar envío en radar' : metodoPagoViaje === 'saldo_corporativo' ? 'Pagar con saldo y solicitar viaje' : 'Solicitar viaje'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="relative lg:col-span-7 h-[min(60dvh,520px)] min-h-[300px] lg:h-[calc(100dvh-140px)] rounded-3xl overflow-hidden border shadow-sm sticky top-20">
              <button type="button" onClick={() => obtenerUbicacionActual()} disabled={ubicacionCargando} className="absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-md disabled:opacity-60">
                <Navigation size={15} className={ubicacionCargando ? 'animate-pulse' : 'text-[#FF5722]'} />
                {ubicacionCargando ? 'Buscando...' : 'Mi ubicación'}
              </button>
              <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-500">Cargando mapa...</div>}>
                <MapaLibre
                  coordsOrigen={coordsOrigen}
                  coordsDestino={coordsDestino}
                  coordsUsuario={
                    coordsUsuarioGPS ||
                    (pedidoActivoCliente?.repartidor_lat && pedidoActivoCliente?.repartidor_lon
                      ? { lat: pedidoActivoCliente.repartidor_lat, lng: pedidoActivoCliente.repartidor_lon }
                      : null)
                  }
                  modoSeleccion={modoSeleccionMapa}
                  onMapClick={manejarClicEnMapa}
                  onRutaCalculada={(km, min) => {
                    setDistanciaKm(km);
                    setTiempoEstimadoMin(min);
                    setErrorRuta('');
                  }}
                  onErrorRuta={setErrorRuta}
                  mostrarRuta={true}
                  mostrarPines={true}
                  darkMode={darkMode}
                  recentrarUsuario={recentrarMapa}
                />
              </React.Suspense>
            </div>
          </div>
        )}

        {/* --- VISTA REPARTIDOR --- */}
        {activeTab === 'repartidor' && usuario?.rol === 'repartidor' && (
          <div className="space-y-6 py-4">
            <div className={`border p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[#FF5722] flex items-center justify-center font-bold text-lg">
                  {usuario.nombre ? usuario.nombre.substring(0, 2).toUpperCase() : 'R'}
                </div>
                <div>
                  <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Radar de Trabajos en Carabobo</h3>
                  <p className="text-xs text-slate-500">Gestiona tu estatus y acepta carreras cercanas.</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${repartidorOnline ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${repartidorOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                  <span>{repartidorOnline ? 'Conectado (Recibiendo Pedidos)' : 'Desconectado'}</span>
                </div>
                
                <button 
                  disabled={(repartidorOnline && Boolean(pedidoAsignadoRepartidor)) || cambiandoEstadoRepartidor}
                  onClick={() => void cambiarEstadoRepartidor()}
                  title={pedidoAsignadoRepartidor
                    ? 'No puedes desconectarte durante una entrega activa'
                    : postulacionesPendientesRepartidor.length > 0
                      ? 'Al desconectarte se cancelarán tus postulaciones pendientes'
                      : 'Cambiar estatus'}
                  aria-label={repartidorOnline ? 'Desconectarme' : 'Conectarme'}
                  className={`p-2 rounded-xl border transition cursor-pointer ${pedidoAsignadoRepartidor || cambiandoEstadoRepartidor ? 'opacity-50 cursor-not-allowed bg-slate-200 border-slate-300 text-slate-400' : (repartidorOnline ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200')}`}
                >
                  <Power size={18} className={cambiandoEstadoRepartidor ? 'animate-pulse' : ''} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 space-y-4">
                {pedidoAsignadoRepartidor ? (
                  <div className={`border p-5 rounded-3xl shadow-sm space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-emerald-500">Servicio Asignado Activo</span>
                      <span className="text-xs font-bold text-slate-500">${pedidoAsignadoRepartidor.tarifa}</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p><strong>Cliente:</strong> {pedidoAsignadoRepartidor.cliente_nombre}</p>
                      {pedidoAsignadoRepartidor.tipo_servicio === 'viajes' && <p><strong>Pago:</strong> {etiquetaMetodoPago(pedidoAsignadoRepartidor.metodo_pago)} · {pedidoAsignadoRepartidor.estado_pago === 'pagado' ? 'Confirmado' : 'Pendiente de efectivo'}</p>}
                      <p><strong>Descripción:</strong> {pedidoAsignadoRepartidor.descripcion}</p>
                      <p><strong>Origen (Punto A):</strong> {pedidoAsignadoRepartidor.origen_texto}</p>
                      <p><strong>Destino (Punto B):</strong> {pedidoAsignadoRepartidor.destino_texto}</p>
                    </div>

                    {pedidoAsignadoRepartidor.estado === 'aceptado' && (
                      <button onClick={() => cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'entregado_repartidor')} className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white text-xs font-bold py-3 rounded-xl transition cursor-pointer shadow-sm">
                        {pedidoAsignadoRepartidor.tipo_servicio === 'viajes'
                          ? pedidoAsignadoRepartidor.metodo_pago === 'efectivo' && pedidoAsignadoRepartidor.estado_pago !== 'pagado'
                            ? 'Confirmar efectivo recibido e iniciar viaje'
                            : 'Iniciar viaje'
                          : 'Llegué al Punto A / Retirado'}
                      </button>
                    )}

                    {pedidoAsignadoRepartidor.estado === 'entregado_repartidor' && (
                      <button onClick={() => cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'completado')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-xl transition cursor-pointer shadow-sm">
                        Completar Entrega en Punto B
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Trabajos Disponibles en Radar</h4>
                    {pedidosVisiblesRepartidor.length === 0 ? (
                      <div className={`border p-8 rounded-3xl text-center text-xs font-bold text-slate-400 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                        No hay pedidos cercanos en este momento. Esperando solicitudes...
                      </div>
                    ) : (
                      pedidosVisiblesRepartidor.map(p => {
                        const yaPostulado = postulacionesReales.some(post => post.pedido_id === p.id && post.repartidor_id === usuario.id);
                        return (
                          <div key={p.id} className={`border p-4 rounded-3xl shadow-sm space-y-3 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-orange-100 text-[#FF5722]">{etiquetaTipoServicio(p.tipo_servicio)} · {p.distancia_km} km</span>
                              <span className="text-sm font-black text-[#FF5722]">${p.tarifa}</span>
                            </div>

                            <p className="text-xs font-bold">{p.descripcion}</p>
                            <p className="text-[11px] text-slate-500"><strong>Origen:</strong> {p.origen_texto}</p>
                            <p className="text-[11px] text-slate-500"><strong>Destino:</strong> {p.destino_texto}</p>

                            {yaPostulado ? (
                              <div className="flex space-x-2">
                                <div className="flex-1 bg-amber-500/10 text-amber-600 border border-amber-500/30 text-center py-2 rounded-xl text-xs font-bold">
                                  Postulación Enviada (Esperando al cliente)
                                </div>
                                <button onClick={() => cancelarPostulacion(p.id)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer">
                                  <XCircle size={16} />
                                </button>
                              </div>
                            ) : (
                              <button disabled={!repartidorOnline} onClick={() => postularsePedido(p.id)} className={`w-full py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${!repartidorOnline ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white shadow-sm'}`}>
                                Postularme a este trabajo
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="relative lg:col-span-7 h-[min(60dvh,520px)] min-h-[300px] lg:h-[calc(100dvh-140px)] rounded-3xl overflow-hidden border shadow-sm sticky top-20">
                <button type="button" onClick={() => obtenerUbicacionActual()} disabled={ubicacionCargando} className="absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-md disabled:opacity-60">
                  <Navigation size={15} className={ubicacionCargando ? 'animate-pulse' : 'text-[#FF5722]'} />
                  {ubicacionCargando ? 'Buscando...' : 'Mi ubicación'}
                </button>
                {errorUbicacion && (
                  <div role="alert" className="absolute left-3 right-3 top-14 z-20 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900 shadow">
                    {errorUbicacion}
                    <button type="button" onClick={() => obtenerUbicacionActual()} className="ml-2 font-bold underline">Reintentar</button>
                  </div>
                )}
                <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-500">Cargando mapa...</div>}>
                  <MapaLibre
                    coordsOrigen={
                      pedidoAsignadoRepartidor?.estado === 'aceptado'
                        ? (coordsUsuarioGPS || { lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon })
                        : (pedidoAsignadoRepartidor?.estado === 'entregado_repartidor' ? { lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon } : null)
                    }
                    coordsDestino={
                      pedidoAsignadoRepartidor?.estado === 'aceptado'
                        ? { lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon }
                        : (pedidoAsignadoRepartidor?.estado === 'entregado_repartidor' ? { lat: pedidoAsignadoRepartidor.destino_lat, lng: pedidoAsignadoRepartidor.destino_lon } : null)
                    }
                    coordsUsuario={coordsUsuarioGPS}
                    mostrarRuta={Boolean(pedidoAsignadoRepartidor)}
                    mostrarPines={true}
                    darkMode={darkMode}
                    recentrarUsuario={recentrarMapa}
                  />
                </React.Suspense>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'perfil' && usuario && (
          <section className="mx-auto w-full max-w-4xl py-6 md:py-10">
            <div className={`overflow-hidden rounded-3xl border shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
              <div className="bg-gradient-to-r from-[#FF5722] to-orange-400 px-6 py-7 text-white md:px-8">
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white/70 bg-white/20 text-2xl font-black shadow-md">
                    {fotoLocal ? <img src={fotoLocal} alt="Foto de perfil" className="h-full w-full object-cover" /> : usuario.nombre.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Mi cuenta</p>
                    <h2 className="mt-1 text-2xl font-black">{usuario.nombre}</h2>
                    <span className="mt-2 inline-flex rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold capitalize">{usuario.rol === 'repartidor' ? 'Repartidor' : 'Cliente'}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 p-5 md:grid-cols-[1fr_1.2fr] md:p-8">
                <div className="space-y-4">
                  <div>
                    <h3 className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos de la cuenta</h3>
                    <p className="mt-1 text-xs text-slate-500">Información asociada a tu inicio de sesión.</p>
                  </div>
                  <div className={`space-y-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Correo electrónico</p>
                      <p className="mt-1 break-all text-sm font-semibold">{usuario.email}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Teléfono</p>
                      <p className="mt-1 text-sm font-semibold">{usuario.telefono || 'No registrado'}</p>
                    </div>
                    {usuario.rol === 'repartidor' && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vehículo registrado</p>
                        <p className="mt-1 text-sm font-semibold">{usuario.vehiculo || 'Añade los datos de tu vehículo'}</p>
                        {usuario.placa && <p className="mt-0.5 text-xs text-slate-500">Placa: {usuario.placa}</p>}
                      </div>
                    )}
                  </div>
                  <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                    <div>
                      <h3 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Apariencia</h3>
                      <p className="mt-1 text-xs text-slate-500">Modo oscuro</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={darkMode}
                      aria-label="Modo oscuro"
                      onClick={toggleDarkMode}
                      className={`flex h-10 w-16 shrink-0 items-center rounded-full border p-1 transition-colors ${darkMode ? 'justify-end border-orange-500 bg-orange-500' : 'justify-start border-slate-300 bg-slate-200'}`}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                        {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                      </span>
                    </button>
                  </div>
                  <div className={`rounded-2xl border p-4 text-xs leading-relaxed ${darkMode ? 'border-orange-900/50 bg-orange-950/20 text-slate-300' : 'border-orange-100 bg-orange-50 text-slate-600'}`}>
                    Mantén tus datos y, si eres repartidor, la información de tu vehículo actualizada para que los clientes puedan identificarte.
                  </div>
                </div>

                <form onSubmit={guardarPerfil} className="space-y-4">
                  <div>
                    <h3 className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Editar perfil</h3>
                    <p className="mt-1 text-xs text-slate-500">Los cambios se guardarán en tu cuenta.</p>
                  </div>

                  {errorPerfil && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{errorPerfil}</p>}

                  <div>
                    <label className="text-xs font-bold">Cédula de identidad</label>
                    <div className="mt-1 flex">
                      <span className={`inline-flex items-center rounded-l-xl border border-r-0 px-3 text-xs font-bold ${darkMode ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-orange-200 bg-orange-100 text-[#FF5722]'}`}>V-</span>
                      <input type="text" inputMode="numeric" value={cedulaNumero} onChange={e => setCedulaNumero(e.target.value.replace(/\D/g, ''))} maxLength={8} className={`w-full rounded-r-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                    </div>
                  </div>

                  {usuario.rol === 'repartidor' && (
                    <div className={`space-y-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Datos del vehículo</p>
                      <div>
                        <label className="text-xs font-bold">Vehículo</label>
                        <input type="text" required maxLength={100} value={tipoVehiculo} onChange={e => setTipoVehiculo(e.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`} />
                      </div>
                      <div>
                        <label className="text-xs font-bold">Placa</label>
                        <input type="text" value={placaVehiculo} onChange={e => validarPlacaFormato(e.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm uppercase ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`} />
                        {errorPlaca && <p className="mt-1 text-[10px] font-bold text-red-600">{errorPlaca}</p>}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold">Foto de perfil</label>
                    <input type="file" accept="image/*" onChange={e => convertirImagenSegura(e, setFotoLocal)} className="mt-1 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-orange-100 file:px-3 file:py-2 file:font-bold file:text-[#FF5722]" />
                    {fotoLocal && <img src={fotoLocal} alt="Vista previa del perfil" className="mt-3 h-16 w-16 rounded-full border-2 border-[#FF5722] object-cover" />}
                  </div>

                  <button type="submit" disabled={guardandoPerfil || Boolean(errorPlaca)} className="w-full rounded-xl bg-[#FF5722] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#F4511E] disabled:cursor-not-allowed disabled:opacity-50">
                    {guardandoPerfil ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'admin' && usuario?.es_admin && (
          <section className="mx-auto w-full max-w-5xl space-y-6 py-6 md:py-10">
            <div className={`flex flex-col gap-4 rounded-3xl border p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5722]">Panel seguro</p>
                <h2 className={`mt-1 text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Administración de pagos</h2>
                <p className="mt-1 text-xs text-slate-500">Verifica los comprobantes directamente en la cuenta receptora antes de aprobarlos.</p>
              </div>
              <button type="button" onClick={() => void cargarPanelAdmin()} disabled={cargandoAdmin} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs font-bold text-[#FF5722] disabled:opacity-50">
                {cargandoAdmin ? 'Actualizando…' : 'Actualizar panel'}
              </button>
            </div>

            {errorAdmin && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{errorAdmin}</p>}
            {mensajeAdmin && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{mensajeAdmin}</p>}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className={`space-y-4 rounded-3xl border p-5 shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
                <div>
                  <h3 className="text-base font-black">Pagos y reembolsos de Pago Móvil</h3>
                  <p className="mt-1 text-xs text-slate-500">Verifica el abono en el banco; si el viaje se canceló, devuelve el monto antes de confirmarlo.</p>
                </div>
                {pagosPendientesAdmin.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950">No hay pagos ni reembolsos pendientes.</p>
                ) : pagosPendientesAdmin.map(pago => (
                  <article key={pago.id} className={`space-y-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">{pago.cliente_nombre}</p>
                        <p className="text-[11px] text-slate-500">{pago.cliente_email}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${pago.estado_pago === 'reembolso_pendiente' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        {pago.estado_pago === 'reembolso_pendiente' ? `Reembolso · Viaje #${pago.id}` : `Pago · Viaje #${pago.id}`}
                      </span>
                    </div>
                    <p className="text-xs"><strong>Referencia:</strong> {pago.referencia_pago || 'Sin referencia'}</p>
                    <p className="text-xs"><strong>Monto:</strong> ${Number(pago.tarifa).toFixed(2)}</p>
                    <p className="text-[11px] text-slate-500">{pago.origen_texto} → {pago.destino_texto}</p>
                    {pago.estado_pago === 'reembolso_pendiente' ? (
                      <>
                        <p className="rounded-xl bg-red-50 p-3 text-[11px] text-red-800 dark:bg-red-950/30 dark:text-red-300">
                          Viaje cancelado. Verifica si recibiste el abono; si se recibió, devuelve ${Number(pago.tarifa).toFixed(2)} antes de confirmar.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => void revisarPagoManual(pago.id, 'sin_pago')} className="rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">No hubo pago</button>
                          <button type="button" onClick={() => void revisarPagoManual(pago.id, 'reembolsar')} className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white">Confirmar reembolso</button>
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => void revisarPagoManual(pago.id, 'rechazar')} className="rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700">Rechazar</button>
                        <button type="button" onClick={() => void revisarPagoManual(pago.id, 'aprobar')} className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white">Confirmar pago</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>

              <div className="space-y-6">
                <form onSubmit={guardarConfiguracionPagoAdmin} className={`space-y-4 rounded-3xl border p-5 shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
                  <div>
                    <h3 className="text-base font-black">Datos para recibir Pago Móvil</h3>
                    <p className="mt-1 text-xs text-slate-500">Se mostrarán a los clientes al solicitar un viaje.</p>
                  </div>
                  {([
                    ['banco', 'Banco'],
                    ['telefono', 'Teléfono afiliado'],
                    ['cedula', 'Cédula o RIF'],
                    ['titular', 'Nombre del titular']
                  ] as const).map(([field, label]) => (
                    <label key={field} className="block text-xs font-bold">
                      {label}
                      <input required maxLength={field === 'titular' ? 120 : field === 'banco' ? 100 : 30} value={configPagoAdmin[field]} onChange={event => setConfigPagoAdmin(current => ({ ...current, [field]: event.target.value }))} className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                    </label>
                  ))}
                  <button type="submit" className="w-full rounded-xl bg-[#FF5722] py-3 text-xs font-bold text-white">Guardar datos de Pago Móvil</button>
                </form>

                <form onSubmit={recargarSaldoCorporativo} className={`space-y-4 rounded-3xl border p-5 shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
                  <div>
                    <h3 className="text-base font-black">Recargar saldo corporativo</h3>
                    <p className="mt-1 text-xs text-slate-500">Busca la cuenta del cliente por correo. El monto se registra en dólares.</p>
                  </div>
                  <input type="email" required value={emailRecargaSaldo} onChange={event => setEmailRecargaSaldo(event.target.value)} placeholder="cliente@empresa.com" className={`w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                  <input type="number" required min="0.01" max="10000" step="0.01" value={montoRecargaSaldo} onChange={event => setMontoRecargaSaldo(event.target.value)} placeholder="Monto en USD" className={`w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                  <input type="text" maxLength={250} value={notaRecargaSaldo} onChange={event => setNotaRecargaSaldo(event.target.value)} placeholder="Nota o referencia (opcional)" className={`w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                  <button type="submit" className="w-full rounded-xl bg-[#FF5722] py-3 text-xs font-bold text-white">Aplicar recarga</button>
                </form>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}