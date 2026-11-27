import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Bike, MapPin, ArrowLeft, ArrowRight, Camera, ImagePlus, Mic, MicOff, User, Eye, EyeOff, Clock, Send, Power, Star, Sun, Moon, Monitor, DollarSign, XCircle, Navigation, CheckCircle2, Circle, Package, ShoppingBag, CarFront, LogOut, Users, UserRound, ChevronDown, Bell, BellOff } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { registerWebPushToken } from './firebasePush';
import { loadGoogleMaps, mensajeErrorGoogleMaps } from './googleMaps';
import { parseGoogleMapsLocationInput } from './googleMapsLink';
import {
  clearAllDriverNotifications,
  clearDriverOrderNotification,
  getDriverNotificationPermission,
  requestDriverNotificationPermission,
  requestAppNotificationPermission,
  showDriverOrderNotification,
  showDriverUpdateNotification,
  type DriverOrderNotice,
  type NotificationPermissionState
} from './driverNotifications';

const MapaGoogle = React.lazy(() => import('./MapaGoogle'));

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
  publicado_en?: string | null;
  iniciado_en?: string | null;
  completado_en?: string | null;
  motivo_cancelacion?: string | null;
  estado: 'pendiente' | 'postulado' | 'aceptado' | 'entregado_repartidor' | 'completado' | 'cancelado';
  repartidor_lat?: number;
  repartidor_lon?: number;
  created_at?: string;
}

interface PedidoHistorialRepartidor {
  id: number;
  tipo_servicio: string;
  origen_texto: string;
  destino_texto: string;
  distancia_km: number;
  tarifa: string;
  creado_en: string;
  completado_en: string;
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
  if (metodo === 'saldo_corporativo') return 'Saldo anterior (pedido histórico)';
  return 'Sin método de pago';
};

const medirDistanciaMetros = (
  primera: { lat: number; lng: number },
  segunda: { lat: number; lng: number }
) => {
  const deltaLat = (primera.lat - segunda.lat) * 111_320;
  const deltaLng = (primera.lng - segunda.lng) * 111_320 * Math.cos(segunda.lat * Math.PI / 180);
  return Math.hypot(deltaLat, deltaLng);
};

const etiquetaDuracion = (segundos?: number | null) => {
  if (segundos === undefined || segundos === null || !Number.isFinite(segundos)) return 'No disponible';
  const minutosTotales = Math.floor(segundos / 60);
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  return horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
};

interface Postulacion {
  id: number;
  pedido_id: number;
  repartidor_id: number;
  repartidor_nombre: string;
  vehiculo: string;
  placa?: string;
  vehiculo_foto?: string;
  calificacion: number;
  estado: 'pendiente' | 'aceptado' | 'rechazado';
}

interface PerfilPublico {
  id: number;
  nombre: string;
  rol: 'cliente' | 'repartidor';
  foto: string;
  vehiculo: string;
  promedio: number;
  cantidad: number;
  rango: string;
}

interface ResumenCalificaciones {
  perfil: { promedio: number; cantidad: number; rango: string };
  total_pedidos: number;
  pedidos: Array<{
    pedido_id: number;
    tipo_servicio: string;
    creado_en: string;
    contraparte_id: number;
    contraparte_nombre: string;
    contraparte_foto?: string;
    contraparte_vehiculo?: string;
    mis_estrellas: number;
  }>;
}

type SugerenciaDireccion =
  | {
      clase: 'prediccion';
      display_name: string;
      tipo: string;
      prediction: google.maps.places.PlacePrediction;
    }
  | {
      clase: 'lugar';
      display_name: string;
      tipo: string;
      place: google.maps.places.Place;
    };

const etiquetasTipoDireccion: Record<string, string> = {
  street_address: 'Dirección',
  premise: 'Dirección',
  route: 'Calle',
  neighborhood: 'Sector',
  sublocality: 'Sector',
  locality: 'Localidad',
  administrative_area_level_2: 'Localidad',
  establishment: 'Establecimiento',
  point_of_interest: 'Establecimiento',
  restaurant: 'Restaurante',
  cafe: 'Cafetería',
  bar: 'Bar',
  store: 'Tienda',
  supermarket: 'Supermercado',
  grocery_store: 'Mercado',
  pharmacy: 'Farmacia',
  gas_station: 'Gasolinera',
  hospital: 'Hospital',
  bank: 'Banco',
  school: 'Escuela',
  university: 'Universidad',
  shopping_mall: 'Centro comercial',
  lodging: 'Alojamiento',
  park: 'Parque',
  tourist_attraction: 'Lugar de interés'
};

const tipoDireccionGoogle = (types: string[]) => {
  for (const type of types) {
    if (etiquetasTipoDireccion[type]) return type;
  }
  return 'place';
};

const obtenerDireccionGoogle = async (location: { lat: number; lng: number }): Promise<string> => {
  const { geocoding, places } = await loadGoogleMaps();
  let errorGeocoding: unknown;
  try {
    const response = await new geocoding.Geocoder().geocode({
      location,
      language: 'es',
      region: 'VE'
    });
    const prioridadTipos: Record<string, number> = {
      street_address: 100,
      premise: 95,
      subpremise: 95,
      intersection: 90,
      route: 85,
      establishment: 80,
      point_of_interest: 75,
      neighborhood: 65,
      sublocality: 60,
      locality: 55
    };
    const puntuacion = (types: string[]) => Math.max(
      0,
      ...types.map(type => prioridadTipos[type] ?? 0)
    );
    const resultado = response.results
      .filter(item => item.formatted_address?.trim() && !item.types.includes('plus_code'))
      .sort((a, b) => puntuacion(b.types) - puntuacion(a.types))[0];
    if (resultado) {
      const obtenerComponente = (types: string[]) => {
        for (const type of types) {
          const componente = resultado.address_components.find(item => item.types.includes(type));
          if (componente) return componente.long_name.trim();
        }
        return '';
      };
      const calle = [
        obtenerComponente(['street_number']),
        obtenerComponente(['route'])
      ].filter(Boolean).join(' ');
      const sector = obtenerComponente([
        'neighborhood',
        'sublocality_level_1',
        'sublocality_level_2',
        'sublocality'
      ]);
      const municipio = obtenerComponente([
        'administrative_area_level_2',
        'locality',
        'administrative_area_level_3'
      ]);
      const region = obtenerComponente(['administrative_area_level_1']);
      const partes = [calle || obtenerComponente(['premise']), sector, municipio, region]
        .filter((parte, indice, todas) => Boolean(parte)
          && todas.findIndex(otra => otra.toLocaleLowerCase('es') === parte.toLocaleLowerCase('es')) === indice);
      const direccion = partes.join(', ') || resultado.formatted_address.trim();
      if (direccion) return direccion;
    }
  } catch (error) {
    errorGeocoding = error;
  }

  try {
    const response = await places.Place.searchNearby({
      fields: ['displayName', 'formattedAddress', 'location', 'types'],
      includedTypes: ['neighborhood', 'sublocality', 'locality'],
      locationRestriction: { center: location, radius: 1500 },
      maxResultCount: 10,
      rankPreference: 'DISTANCE',
      language: 'es',
      region: 'VE'
    });
    const place = response.places.find(candidate =>
      candidate.displayName?.trim()
      && candidate.types?.some(type => ['neighborhood', 'sublocality', 'locality'].includes(type))
    );
    return place?.formattedAddress?.trim() || place?.displayName?.trim() || '';
  } catch (error) {
    console.error('No se pudo resolver el nombre con Geocoding ni Places:', { errorGeocoding, error });
    return '';
  }
};

interface MensajeChat {
  id: number;
  pedido_id: number;
  remitente_id: number;
  remitente_nombre: string;
  mensaje: string;
  tipo?: 'texto' | 'imagen' | 'audio';
  media_mime?: string | null;
  media_nombre?: string | null;
  creado_en?: string;
}

interface ArchivoChatAdmin {
  pedido_id: number;
  cliente_nombre: string;
  repartidor_nombre: string | null;
  tipo_servicio: string;
  iniciado_en: string | null;
  completado_en: string;
  duracion_segundos: number | null;
  cantidad_mensajes: number;
  vence_en: string;
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
  correo_verificado?: boolean;
  telefono_verificado?: boolean;
}

interface PostulacionRepartidorAdmin {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  cedula: string;
  vehiculo: string;
  placa: string;
  estado: 'pendiente_revision' | 'aprobada';
  correo_verificado: boolean;
  telefono_verificado: boolean;
  creado_en: string;
}

type AccionCorreo = { tipo: 'verificar' | 'activar-repartidor'; token: string };
type RegistroPendiente = {
  email: string;
  tipo: 'cliente' | 'repartidor';
  etapa: 'correo' | 'revision';
  mensaje: string;
};

type MetodoPagoViaje = 'pago_movil';

interface ConfiguracionPago {
  pagoMovil: {
    banco: string;
    telefono: string;
    cedula: string;
    titular: string;
  };
}

interface HistorialPagoAdmin {
  id: number;
  pedido_id: number;
  actor_nombre?: string;
  actor_rol: string;
  accion: string;
  metodo_pago: string;
  estado_pago: string;
  monto: string | number;
  referencia_pago?: string | null;
  detalle: string;
  creado_en: string;
  tipo_servicio: string;
  descripcion: string;
  cliente_nombre: string;
  origen_texto: string;
  destino_texto: string;
  distancia_km: number;
  tiempo_min: number;
  estado_pedido: string;
}

interface ActividadAdmin {
  id: number;
  actor_nombre: string;
  actor_rol: string;
  evento: string;
  resumen: string;
  pedido_id: number | null;
  creado_en: string;
}

interface MetricasAdmin {
  cuentas_totales: number;
  clientes_totales: number;
  repartidores_totales: number;
  usuarios_activos: number;
  clientes_activos: number;
  repartidores_activos: number;
}

type ModoBusquedaAdmin = 'codigo' | 'fecha' | 'texto';

interface ConfiguracionTarifas {
  enviosPorKm: number;
  viajesDesde1KmPorKm: number;
  viajesLargosPorKm: number;
  viajesLargosDesdeKm: number;
  tarifaMinima: number;
}

interface TasasCambio {
  bolivaresPorDolar: number;
  actualizadoEn: string;
  desactualizada: boolean;
}

interface PedidoBusquedaAdmin extends PedidoReal {
  codigo: string;
  cliente_email: string;
  repartidor_nombre?: string;
}

const API_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')
  || (import.meta.env.DEV ? `http://${window.location.hostname}:5000` : '');

const assertApiConfigured = () => {
  if (!API_URL) throw new Error('El servicio de solicitudes no está configurado. Inténtalo más tarde.');
};

const authenticatedFetch = (url: string, options: RequestInit = {}) => {
  assertApiConfigured();
  const token = localStorage.getItem('llevalo_token');
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
};

const guardarTokenPush = async (
  token: string,
  platform: 'android' | 'web',
  disponible: boolean
): Promise<void> => {
  const response = await authenticatedFetch(`${API_URL}/api/notifications/device-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform, disponible })
  });
  if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo registrar el dispositivo'));
};

const actualizarDisponibilidadPush = async (disponible: boolean): Promise<void> => {
  const response = await authenticatedFetch(`${API_URL}/api/notifications/availability`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disponible })
  });
  if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo actualizar tu disponibilidad'));
};

const retirarTokenPush = async (token: string): Promise<void> => {
  const response = await authenticatedFetch(`${API_URL}/api/notifications/device-token`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo retirar el dispositivo'));
};

const mensajeErrorApi = async (response: Response, mensajePredeterminado: string): Promise<string> => {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return `${mensajePredeterminado} (HTTP ${response.status})`;
};

const horaInicial = Date.now();

const codigoPedido = (id: number) => `LLV-${String(id).padStart(6, '0')}`;

const convertirDolares = (monto: number, tasas: TasasCambio) =>
  monto * tasas.bolivaresPorDolar;

const formatoMoneda = (monto: number) =>
  `Bs. ${monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const crearParametrosBusquedaAdmin = (
  modo: ModoBusquedaAdmin,
  consulta: string,
  fecha: string,
  hora: string
) => {
  const parametros = new URLSearchParams({ modo });
  if (modo !== 'fecha') parametros.set('q', consulta);
  if (modo === 'fecha') {
    if (fecha) parametros.set('fecha', fecha);
    if (hora) parametros.set('hora', hora);
    const referenciaLocal = fecha ? new Date(`${fecha}T${hora || '12:00'}`) : new Date();
    if (Number.isFinite(referenciaLocal.getTime())) {
      parametros.set('desfase', String(referenciaLocal.getTimezoneOffset()));
    }
  }
  return parametros;
};

interface AdminAccordionProps {
  title: string;
  darkMode: boolean;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function AdminAccordion({ title, darkMode, badge, defaultOpen = true, children }: AdminAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details open={isOpen} onToggle={event => setIsOpen(event.currentTarget.open)} className={`admin-accordion rounded-3xl border shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <h3 className="min-w-0 text-sm font-black">{title}</h3>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={18} className="admin-accordion-chevron text-slate-500" />
        </span>
      </summary>
      <div className={`admin-accordion-content border-t p-4 md:p-5 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
        {children}
      </div>
    </details>
  );
}

export default function App() {
  type Tab = 'home' | 'cliente' | 'repartidor' | 'perfil' | 'auth' | 'admin';
  type SeccionAdmin = 'actividad' | 'solicitudes' | 'pedidos' | 'pagos' | 'tarifas' | 'archivos';
  type PreferenciaTema = 'system' | 'light' | 'dark';
  const accionCorreoInicial: AccionCorreo | null = (() => {
    if (typeof window === 'undefined') return null;
    const parametros = new URLSearchParams(window.location.hash.slice(1));
    const tipo = parametros.get('accionCorreo');
    const token = parametros.get('tokenCorreo');
    return token && (tipo === 'verificar' || tipo === 'activar-repartidor') ? { tipo, token } : null;
  })();
  const [activeTab, setActiveTab] = useState<Tab>(accionCorreoInicial ? 'auth' : 'home');
  const historialNavegacionRef = useRef<Tab[]>([]);
  const [serviceType, setServiceType] = useState<TipoServicio>('envios');
  const [pasoSolicitud, setPasoSolicitud] = useState<'tipo' | 'ruta' | 'pago' | null>(null);
  
  const [preferenciaTema, setPreferenciaTema] = useState<PreferenciaTema>(() => {
    const stored = localStorage.getItem('llevalo_theme_preference');
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  });
  const [temaOscuroDelSistema, setTemaOscuroDelSistema] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const darkMode = preferenciaTema === 'system' ? temaOscuroDelSistema : preferenciaTema === 'dark';
  const [estadoConexion, setEstadoConexion] = useState<'sin-internet' | 'lenta' | null>(
    () => typeof navigator !== 'undefined' && !navigator.onLine ? 'sin-internet' : null
  );
  const [probandoConexion, setProbandoConexion] = useState(false);
  const fallosConexionRef = useRef(0);
  const medicionesLentasRef = useRef(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const actualizarTemaDelSistema = (event: MediaQueryListEvent) => setTemaOscuroDelSistema(event.matches);
    mediaQuery.addEventListener('change', actualizarTemaDelSistema);
    return () => mediaQuery.removeEventListener('change', actualizarTemaDelSistema);
  }, []);

  useEffect(() => {
    localStorage.setItem('llevalo_theme_preference', preferenciaTema);
    localStorage.setItem('llevalo_dark_mode', String(darkMode));
  }, [preferenciaTema, darkMode]);

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
  const [authMode, setAuthMode] = useState<'choice' | 'login' | 'register' | 'pending' | 'action'>(accionCorreoInicial ? 'action' : 'choice');
  const [authRoleSelection, setAuthRoleSelection] = useState<'cliente' | 'repartidor'>('cliente');
  const [errorAuth, setErrorAuth] = useState('');
  const [mensajeAuth, setMensajeAuth] = useState('');
  const [registroPendiente, setRegistroPendiente] = useState<RegistroPendiente | null>(null);
  const [accionCorreo, setAccionCorreo] = useState<AccionCorreo | null>(accionCorreoInicial);
  const [codigoCorreo, setCodigoCorreo] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState('');

  const [repartidorOnline, setRepartidorOnline] = useState<boolean>(() => {
    const storedUser = localStorage.getItem('llevalo_usuario');
    if (!storedUser) return false;
    try {
      const parsed = JSON.parse(storedUser) as UsuarioSesion;
      return parsed.rol === 'repartidor'
        && localStorage.getItem(`llevalo_driver_online_${parsed.id}`) === 'true';
    } catch {
      return false;
    }
  });
  const [cambiandoEstadoRepartidor, setCambiandoEstadoRepartidor] = useState(false);
  const [avisosRepartidorActivos, setAvisosRepartidorActivos] = useState(() => {
    const storedUser = localStorage.getItem('llevalo_usuario');
    if (!storedUser) return false;
    try {
      const parsed = JSON.parse(storedUser) as UsuarioSesion;
      return parsed.rol === 'repartidor' && localStorage.getItem(`llevalo_driver_notifications_${parsed.id}`) === 'true';
    } catch {
      return false;
    }
  });
  const [permisoAvisosRepartidor, setPermisoAvisosRepartidor] = useState<NotificationPermissionState>('default');
  const [permisoAvisosAdmin, setPermisoAvisosAdmin] = useState<NotificationPermissionState>('default');
  const [avisosAdminActivos, setAvisosAdminActivos] = useState(false);
  const [errorAvisosAdmin, setErrorAvisosAdmin] = useState('');
  const [intentoAvisosAdmin, setIntentoAvisosAdmin] = useState(0);
  const [pagoNotificadoId, setPagoNotificadoId] = useState<number | null>(null);
  const pagoAdminNotificacionPendienteRef = useRef<number | null>(null);
  const [pedidosCargadosUsuarioId, setPedidosCargadosUsuarioId] = useState<number | null>(null);
  const snapshotAvisosRepartidorRef = useRef<{
    userId: number;
    requestIds: Set<number>;
    applications: Map<number, string>;
    notifiedIds: Set<number>;
  } | null>(null);
  const ultimoBloqueTemporizadorRef = useRef(new Map<number, number>());
  const llegadaProcesadaRef = useRef<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cedulaNumero, setCedulaNumero] = useState(() => usuario?.cedula?.replace(/^[VvEe]-/, '') || '');
  const [tipoCedula, setTipoCedula] = useState<'V' | 'E'>(() =>
    usuario?.cedula?.toUpperCase().startsWith('E-') ? 'E' : 'V'
  );
  const [fotoLocal, setFotoLocal] = useState(() => usuario?.foto || '');
  const inputFotoPerfilRef = useRef<HTMLInputElement>(null);
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
  const coordsUsuarioGPSRef = useRef(coordsUsuarioGPS);
  useEffect(() => {
    coordsUsuarioGPSRef.current = coordsUsuarioGPS;
  }, [coordsUsuarioGPS]);
  const [ubicacionCargando, setUbicacionCargando] = useState(true);
  const [errorUbicacion, setErrorUbicacion] = useState('');
  const disponiblePushRepartidor = repartidorOnline && Boolean(coordsUsuarioGPS);
  const disponiblePushRepartidorRef = useRef(disponiblePushRepartidor);
  useEffect(() => {
    disponiblePushRepartidorRef.current = disponiblePushRepartidor;
  }, [disponiblePushRepartidor]);
  const [recentrarMapa, setRecentrarMapa] = useState(0);
  const objetivoUbicacionRef = useRef<'origen' | 'destino' | null>(null);
  const [objetivoUbicacion, setObjetivoUbicacion] = useState<'origen' | 'destino' | null>(null);

  const [origenInput, setOrigenInput] = useState('');
  const [coordsOrigen, setCoordsOrigen] = useState<{ lat: number; lng: number } | null>(null);
  const [destinoInput, setDestinoInput] = useState('');
  const [coordsDestino, setCoordsDestino] = useState<{ lat: number; lng: number } | null>(null);
  
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
  const geocodificacionGPSRef = useRef<AbortController | null>(null);
  const autocompleteSessionTokensRef = useRef<Record<
    'origen' | 'destino',
    google.maps.places.AutocompleteSessionToken | null
  >>({ origen: null, destino: null });
  const [distanciaKm, setDistanciaKm] = useState<number>(0);
  const [tiempoEstimadoMin, setTiempoEstimadoMin] = useState<number>(0);
  
  const rutaCompletaLista = Boolean(coordsOrigen && coordsDestino && origenInput.trim() && destinoInput.trim());
  const esperandoNombreDireccion = [origenInput, destinoInput]
    .some(input => /^Buscando (sector cercano|lugar)/i.test(input));

  const [configuracionTarifas, setConfiguracionTarifas] = useState<ConfiguracionTarifas | null>(null);
  const [tasasCambio, setTasasCambio] = useState<TasasCambio | null>(null);
  const [cargandoTarifas, setCargandoTarifas] = useState(false);
  const [errorTarifas, setErrorTarifas] = useState('');
  const [seccionAdmin, setSeccionAdmin] = useState<SeccionAdmin>('actividad');
  const [modoBusquedaAdmin, setModoBusquedaAdmin] = useState<ModoBusquedaAdmin>('codigo');
  const [busquedaAdmin, setBusquedaAdmin] = useState('');
  const [fechaBusquedaAdmin, setFechaBusquedaAdmin] = useState('');
  const [horaBusquedaAdmin, setHoraBusquedaAdmin] = useState('');
  const [sugerenciasBusquedaAdmin, setSugerenciasBusquedaAdmin] = useState<PedidoBusquedaAdmin[]>([]);
  const [errorAutocompletadoAdmin, setErrorAutocompletadoAdmin] = useState('');
  const [mostrarSugerenciasAdmin, setMostrarSugerenciasAdmin] = useState(false);
  const [resultadosBusquedaAdmin, setResultadosBusquedaAdmin] = useState<PedidoBusquedaAdmin[]>([]);
  const [busquedaEjecutadaAdmin, setBusquedaEjecutadaAdmin] = useState(false);
  const [cargandoBusquedaAdmin, setCargandoBusquedaAdmin] = useState(false);
  const [configuracionTarifasAdmin, setConfiguracionTarifasAdmin] = useState<ConfiguracionTarifas>({
    enviosPorKm: 0.5,
    viajesDesde1KmPorKm: 0.28,
    viajesLargosPorKm: 0.38,
    viajesLargosDesdeKm: 25,
    tarifaMinima: 1.5
  });

  const costoPorKm = serviceType === 'viajes'
    ? (distanciaKm >= (configuracionTarifas?.viajesLargosDesdeKm ?? 25)
      ? configuracionTarifas?.viajesLargosPorKm ?? 0.38
      : configuracionTarifas?.viajesDesde1KmPorKm ?? 0.28)
    : configuracionTarifas?.enviosPorKm ?? 0.5;
  const tarifaMinima = configuracionTarifas?.tarifaMinima ?? 1.5;
  const tarifaTotal = rutaCompletaLista
    ? (serviceType === 'viajes' && distanciaKm < 1
      ? tarifaMinima
      : Math.max(tarifaMinima, distanciaKm * costoPorKm)).toFixed(2)
    : '0.00';
  const tarifaUsd = Number(tarifaTotal);
  const tarifaEnBolivares = tasasCambio
    ? formatoMoneda(convertirDolares(tarifaUsd, tasasCambio))
    : null;
  const mostrarMontoPedido = (monto: string | number) => {
    const montoUsd = Number(monto);
    if (!Number.isFinite(montoUsd)) return 'Monto no disponible';
    const baseUsd = `$${montoUsd.toFixed(2)} USD`;
    if (!tasasCambio) return baseUsd;
    const equivalente = formatoMoneda(convertirDolares(montoUsd, tasasCambio));
    return `${equivalente} aprox. · ${baseUsd}`;
  };

  const [pedidosReales, setPedidosReales] = useState<PedidoReal[]>([]);
  const [historialTrabajosRepartidor, setHistorialTrabajosRepartidor] = useState<PedidoHistorialRepartidor[]>([]);
  const [cursorHistorialRepartidor, setCursorHistorialRepartidor] = useState<string | null>(null);
  const [cargandoHistorialRepartidor, setCargandoHistorialRepartidor] = useState(false);
  const [errorHistorialRepartidor, setErrorHistorialRepartidor] = useState('');
  const [historialRepartidorExpandido, setHistorialRepartidorExpandido] = useState(false);
  const [postulacionesReales, setPostulacionesReales] = useState<Postulacion[]>([]);
  const [mensajesChat, setMensajesChat] = useState<MensajeChat[]>([]);
  const [resumenCalificaciones, setResumenCalificaciones] = useState<ResumenCalificaciones | null>(null);
  const [estrellasSeleccionadas, setEstrellasSeleccionadas] = useState<Record<number, number>>({});
  const [calificandoPedidoId, setCalificandoPedidoId] = useState<number | null>(null);
  const [calificacionesExpandidas, setCalificacionesExpandidas] = useState(false);
  const [cargandoHistorialCalificaciones, setCargandoHistorialCalificaciones] = useState(false);
  const [perfilPublico, setPerfilPublico] = useState<PerfilPublico | null>(null);
  const [perfilPublicoCargando, setPerfilPublicoCargando] = useState(false);
  const [errorPerfilPublico, setErrorPerfilPublico] = useState('');
  const [nuevoMensajeTexto, setNuevoMensajeTexto] = useState('');
  const [urlsAdjuntosChat, setUrlsAdjuntosChat] = useState<Record<number, string>>({});
  const [grabandoAudio, setGrabandoAudio] = useState(false);
  const [errorChat, setErrorChat] = useState('');
  const inputAdjuntoChatRef = useRef<HTMLInputElement>(null);
  const grabadoraChatRef = useRef<MediaRecorder | null>(null);
  const flujoAudioChatRef = useRef<MediaStream | null>(null);
  const pedidoChatAdjuntoRef = useRef<number | null>(null);
  const urlsAdjuntosChatRef = useRef(new Map<number, string>());
  const [metodoPagoViaje, setMetodoPagoViaje] = useState<MetodoPagoViaje>('pago_movil');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [configuracionPago, setConfiguracionPago] = useState<ConfiguracionPago | null>(null);
  const [cargandoConfiguracionPago, setCargandoConfiguracionPago] = useState(false);
  const [errorPago, setErrorPago] = useState('');
  const [pagosPendientesAdmin, setPagosPendientesAdmin] = useState<PedidoReal[]>([]);
  const [postulacionesAdmin, setPostulacionesAdmin] = useState<PostulacionRepartidorAdmin[]>([]);
  const [historialPagosAdmin, setHistorialPagosAdmin] = useState<HistorialPagoAdmin[]>([]);
  const [archivosChatAdmin, setArchivosChatAdmin] = useState<ArchivoChatAdmin[]>([]);
  const [metricasAdmin, setMetricasAdmin] = useState<MetricasAdmin | null>(null);
  const [actividadAdmin, setActividadAdmin] = useState<ActividadAdmin[]>([]);
  const [cargandoAdmin, setCargandoAdmin] = useState(false);
  const [errorAdmin, setErrorAdmin] = useState('');
  const [mensajeAdmin, setMensajeAdmin] = useState('');
  const [configPagoAdmin, setConfigPagoAdmin] = useState({ banco: '', telefono: '', cedula: '', titular: '' });
  const [horaActual, setHoraActual] = useState(horaInicial);
  const usuarioId = usuario?.id;

  useEffect(() => {
    if (!usuarioId) return;
    let descartado = false;
    const pendientes = mensajesChat.filter(mensaje =>
      mensaje.tipo !== 'texto'
      && mensaje.media_mime
      && !urlsAdjuntosChatRef.current.has(mensaje.id)
    );
    pendientes.forEach(mensaje => {
      void authenticatedFetch(`${API_URL}/api/pedidos/${mensaje.pedido_id}/chat/media/${mensaje.id}`)
        .then(async response => {
          if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo cargar un archivo del chat'));
          return response.blob();
        })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          if (descartado) {
            URL.revokeObjectURL(url);
            return;
          }
          urlsAdjuntosChatRef.current.set(mensaje.id, url);
          setUrlsAdjuntosChat(current => ({ ...current, [mensaje.id]: url }));
        })
        .catch(error => {
          if (descartado) return;
          console.error('Error cargando archivo de chat:', error);
          setErrorChat(error instanceof Error ? error.message : 'No se pudo cargar un archivo del chat.');
        });
    });
    return () => { descartado = true; };
  }, [mensajesChat, usuarioId]);

  useEffect(() => {
    urlsAdjuntosChatRef.current.forEach(url => URL.revokeObjectURL(url));
    urlsAdjuntosChatRef.current.clear();
  }, [usuarioId]);

  useEffect(() => () => {
    urlsAdjuntosChatRef.current.forEach(url => URL.revokeObjectURL(url));
    flujoAudioChatRef.current?.getTracks().forEach(track => track.stop());
    const recorder = grabadoraChatRef.current;
    if (recorder?.state === 'recording') {
      recorder.onstop = null;
      recorder.stop();
    }
  }, []);

  useEffect(() => {
    if (!accionCorreo) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }, [accionCorreo]);

  const navegarA = (tab: Tab) => {
    if (tab === activeTab) return;
    if (tab === 'home') historialNavegacionRef.current = [];
    else historialNavegacionRef.current.push(activeTab);
    setActiveTab(tab);
    window.history.pushState({ llevaloNavigation: true, tab }, '');
  };

  const volverMenu = useCallback(() => {
    if (activeTab === 'auth' && authMode !== 'choice') {
      setAuthMode('choice');
      return;
    }
    const anterior = historialNavegacionRef.current.pop();
    if (anterior) setActiveTab(anterior);
    else if (activeTab !== 'home') setActiveTab('home');
  }, [activeTab, authMode]);

  useEffect(() => {
    const alRetroceder = () => {
      const modoAuthAnterior = activeTab === 'auth' && authMode !== 'choice';
      volverMenu();
      if (modoAuthAnterior) window.history.pushState({ llevaloNavigation: true, tab: 'auth' }, '');
    };
    window.addEventListener('popstate', alRetroceder);
    return () => window.removeEventListener('popstate', alRetroceder);
  }, [activeTab, authMode, volverMenu]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let descartado = false;
    let listener: PluginListenerHandle | undefined;
    void CapacitorApp.addListener('backButton', () => {
      if (activeTab === 'home' && historialNavegacionRef.current.length === 0) {
        void CapacitorApp.exitApp();
      } else {
        volverMenu();
      }
    }).then(handle => {
      if (descartado) void handle.remove();
      else listener = handle;
    }).catch(error => console.error('No se pudo registrar el botón atrás:', error));
    return () => {
      descartado = true;
      void listener?.remove();
    };
  }, [activeTab, volverMenu]);

  const comprobarConexion = useCallback(async (manual = false): Promise<boolean> => {
    if (manual) setProbandoConexion(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    const inicio = performance.now();

    try {
      if (!navigator.onLine) {
        fallosConexionRef.current = 2;
        setEstadoConexion('sin-internet');
        return false;
      }

      const url = API_URL ? `${API_URL}/api/ping` : window.location.origin;
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`La verificación de conexión respondió ${response.status}.`);

      fallosConexionRef.current = 0;
      if (performance.now() - inicio > 3500) {
        medicionesLentasRef.current += 1;
        if (medicionesLentasRef.current >= 2) setEstadoConexion('lenta');
      } else {
        medicionesLentasRef.current = 0;
        setEstadoConexion(null);
      }
      return true;
    } catch {
      medicionesLentasRef.current = 0;
      fallosConexionRef.current += 1;
      if (manual || !navigator.onLine || fallosConexionRef.current >= 2) {
        setEstadoConexion('sin-internet');
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (manual) setProbandoConexion(false);
    }
  }, []);

  const reintentarConexion = async () => {
    if (await comprobarConexion(true)) window.location.reload();
  };

  useEffect(() => {
    const alDesconectar = () => {
      fallosConexionRef.current = 2;
      setEstadoConexion('sin-internet');
    };
    const alConectar = () => {
      fallosConexionRef.current = 0;
      void comprobarConexion();
    };
    const alVolverALaApp = () => {
      if (!document.hidden) void comprobarConexion();
    };

    const primerChequeo = window.setTimeout(() => void comprobarConexion(), 0);
    const intervalo = window.setInterval(() => void comprobarConexion(), 15_000);
    window.addEventListener('offline', alDesconectar);
    window.addEventListener('online', alConectar);
    document.addEventListener('visibilitychange', alVolverALaApp);
    return () => {
      window.clearInterval(intervalo);
      window.clearTimeout(primerChequeo);
      window.removeEventListener('offline', alDesconectar);
      window.removeEventListener('online', alConectar);
      document.removeEventListener('visibilitychange', alVolverALaApp);
    };
  }, [comprobarConexion]);

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

  const cambiarPreferenciaTema = (preferencia: PreferenciaTema) => {
    setPreferenciaTema(preferencia);
    if (Capacitor.isNativePlatform()) window.location.href = `llevalo://theme/${preferencia}`;
  };

  const sincronizarDatos = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`${API_URL}/api/pedidos`);
      if (res.ok) {
        const data = await res.json();
        setPedidosReales(Array.isArray(data.pedidos) ? data.pedidos : []);
        setPostulacionesReales(Array.isArray(data.postulaciones) ? data.postulaciones : []);
        setMensajesChat(Array.isArray(data.mensajes) ? data.mensajes : []);
        if (usuario) setPedidosCargadosUsuarioId(usuario.id);
      } else if (res.status === 401) {
        localStorage.removeItem('llevalo_token');
        localStorage.removeItem('llevalo_usuario');
        setUsuario(null);
        setAvisosAdminActivos(false);
        setPedidosCargadosUsuarioId(null);
        snapshotAvisosRepartidorRef.current = null;
        ultimoBloqueTemporizadorRef.current.clear();
        setFotoLocal('');
        setCedulaNumero('');
        historialNavegacionRef.current = [];
        setActiveTab('home');
      }
    } catch (e) { console.error('Error sincronizando:', e); }
  }, [usuario]);

  useEffect(() => {
    if (!usuario) return;
    // Apply polling results after the request completes, not during the effect's render.
    // oxlint-disable-next-line react/set-state-in-effect
    sincronizarDatos();
    const intervalo = setInterval(sincronizarDatos, 3000);
    return () => clearInterval(intervalo);
  }, [repartidorOnline, sincronizarDatos, usuario]);

  useEffect(() => {
    if (!usuarioId) return;
    const actualizarPresencia = () => {
      void (async () => {
        try {
          const response = await authenticatedFetch(`${API_URL}/api/auth/activity/presence`, { method: 'POST' });
          if (!response.ok) console.error('No se pudo actualizar la presencia de la cuenta.');
        } catch (error) {
          console.error('Error actualizando la presencia:', error);
        }
      })();
    };

    actualizarPresencia();
    const intervalo = window.setInterval(actualizarPresencia, 20_000);
    const alVolver = () => {
      if (document.visibilityState === 'visible') actualizarPresencia();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [usuarioId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setHoraActual(Date.now());
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

  const activarSeleccionMapa = (tipo: 'origen' | 'destino') => {
    setModoSeleccionMapa(actual => actual === tipo ? null : tipo);
  };

  const fijarCoordenadasDireccion = async (lat: number, lng: number, tipo: 'origen' | 'destino') => {
    geocodificacionGPSRef.current?.abort();
    setErrorGeocoding('');
    setErrorRuta('');
    if (debounceTimerRef.current[tipo]) clearTimeout(debounceTimerRef.current[tipo]!);
    geocodingControllerRef.current[tipo]?.abort();
    autocompleteSessionTokensRef.current[tipo] = null;
    setBuscandoDireccion(current => ({ ...current, [tipo]: true }));
    setModoSeleccionMapa(null);
    setDistanciaKm(0);
    setTiempoEstimadoMin(0);

    if (tipo === 'origen') {
      setCoordsOrigen({ lat, lng });
      setOrigenInput('Leyendo ubicación de Google Maps…');
    } else {
      setCoordsDestino({ lat, lng });
      setDestinoInput('Leyendo ubicación de Google Maps…');
    }
    setSugerenciasOrigen([]);
    setSugerenciasDestino([]);

    const controller = new AbortController();
    geocodingControllerRef.current[tipo] = controller;
    try {
      const nombreLugar = await obtenerDireccionGoogle({ lat, lng });
      if (controller.signal.aborted) return;
      const nombreFinal = nombreLugar || 'Ubicación seleccionada';

      if (tipo === 'origen') setOrigenInput(nombreFinal);
      else setDestinoInput(nombreFinal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Error obteniendo la dirección de las coordenadas:', error);
      const fallback = 'Ubicación seleccionada';
      if (tipo === 'origen') setOrigenInput(fallback);
      else setDestinoInput(fallback);
    } finally {
      if (!controller.signal.aborted) {
        setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
      }
    }
  };

  const manejarClicEnMapa = (lat: number, lng: number) => {
    if (modoSeleccionMapa) void fijarCoordenadasDireccion(lat, lng, modoSeleccionMapa);
  };

  const obtenerUbicacionActual = (objetivo: 'origen' | 'destino' | null = null) => {
    geocodificacionGPSRef.current?.abort();
    objetivoUbicacionRef.current = objetivo;
    setObjetivoUbicacion(objetivo);
    if (objetivo) setModoSeleccionMapa(null);
    setErrorGeocoding('');
    setErrorUbicacion('');
    setErrorRuta('');
    if (objetivo) {
      if (debounceTimerRef.current[objetivo]) clearTimeout(debounceTimerRef.current[objetivo]!);
      geocodingControllerRef.current[objetivo]?.abort();
      setBuscandoDireccion(current => ({ ...current, [objetivo]: false }));
    }

    if (!navigator.geolocation) {
      // oxlint-disable-next-line react/set-state-in-effect
      setErrorUbicacion('Este dispositivo o navegador no permite acceder a la ubicación.');
      return;
    }

    const manejarUbicacion = ({ coords }: GeolocationPosition) => {
      const ubicacion = { lat: coords.latitude, lng: coords.longitude };
      coordsUsuarioGPSRef.current = ubicacion;
      setCoordsUsuarioGPS(ubicacion);
      setRecentrarMapa(value => value + 1);

      const objetivoActual = objetivoUbicacionRef.current;
      if (objetivoActual === 'origen') {
        setDistanciaKm(0);
        setTiempoEstimadoMin(0);
        setCoordsOrigen(ubicacion);
        setOrigenInput('Buscando sector cercano…');
        setSugerenciasOrigen([]);
      } else if (objetivoActual === 'destino') {
        setDistanciaKm(0);
        setTiempoEstimadoMin(0);
        setCoordsDestino(ubicacion);
        setDestinoInput('Buscando sector cercano…');
        setSugerenciasDestino([]);
      }

      setUbicacionCargando(false);
      if (objetivoActual) {
        geocodificacionGPSRef.current?.abort();
        const controller = new AbortController();
        geocodificacionGPSRef.current = controller;
        void (async () => {
          try {
            const direccion = await obtenerDireccionGoogle(ubicacion);
            if (controller.signal.aborted) return;
            const nombre = direccion || 'Ubicación actual';
            if (objetivoActual === 'origen') setOrigenInput(nombre);
            else setDestinoInput(nombre);
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            console.error('No se pudo identificar el sector cercano con Google Geocoding:', error);
            if (objetivoActual === 'origen') setOrigenInput('Ubicación actual');
            else setDestinoInput('Ubicación actual');
          }
        })();
      }
    };

    const manejarErrorUbicacion = (error: GeolocationPositionError, permitirRespaldo = true) => {
      if (error.code === error.PERMISSION_DENIED) {
        coordsUsuarioGPSRef.current = null;
        setCoordsUsuarioGPS(null);
      }
      if (permitirRespaldo
        && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) {
        navigator.geolocation.getCurrentPosition(
          manejarUbicacion,
          errorRespaldo => manejarErrorUbicacion(errorRespaldo, false),
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
        );
        return;
      }
      const mensaje = error.code === error.PERMISSION_DENIED
        ? 'Permite el acceso a la ubicación en los permisos de la app o del navegador y vuelve a intentarlo.'
        : error.code === error.POSITION_UNAVAILABLE
          ? 'No se pudo obtener tu ubicación. Activa el GPS o los servicios de ubicación del dispositivo.'
          : 'La solicitud de ubicación tardó demasiado. Comprueba el GPS e inténtalo de nuevo.';
      setErrorUbicacion(mensaje);
      setUbicacionCargando(false);
    };

    setUbicacionCargando(true);
    navigator.geolocation.getCurrentPosition(
      manejarUbicacion,
      error => manejarErrorUbicacion(error),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );
  };

  const buscarDireccionGeocoding = (query: string, tipo: 'origen' | 'destino') => {
    geocodificacionGPSRef.current?.abort();
    const setInput = tipo === 'origen' ? setOrigenInput : setDestinoInput;
    const setCoords = tipo === 'origen' ? setCoordsOrigen : setCoordsDestino;
    const setSugerencias = tipo === 'origen' ? setSugerenciasOrigen : setSugerenciasDestino;
    const parsedInput = parseGoogleMapsLocationInput(query, tipo);
    setInput(parsedInput?.kind === 'search' ? parsedInput.query : query);
    setModoSeleccionMapa(null);
    setCoords(null);
    setSugerencias([]);
    setErrorGeocoding('');
    setErrorRuta('');
    setBuscandoDireccion(current => ({
      ...current,
      [tipo]: parsedInput?.kind === 'coordinates' || parsedInput?.kind === 'short-link'
        || (parsedInput?.kind === 'search' ? parsedInput.query.trim().length >= 2 : query.trim().length >= 2)
    }));
    setDistanciaKm(0);
    setTiempoEstimadoMin(0);

    if (debounceTimerRef.current[tipo]) clearTimeout(debounceTimerRef.current[tipo]!);
    geocodingControllerRef.current[tipo]?.abort();

    if (parsedInput?.kind === 'coordinates') {
      void fijarCoordenadasDireccion(parsedInput.coordinates.lat, parsedInput.coordinates.lng, tipo);
      return;
    }

    if (parsedInput?.kind === 'short-link') {
      const controller = new AbortController();
      geocodingControllerRef.current[tipo] = controller;
      setInput('Resolviendo enlace de Google Maps…');
      void (async () => {
        try {
          const response = await authenticatedFetch(`${API_URL}/api/maps/resolve-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: query.trim() }),
            signal: controller.signal
          });
          if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo abrir el enlace corto.'));
          const data: { url?: unknown } = await response.json();
          if (controller.signal.aborted) return;
          if (typeof data.url !== 'string') throw new Error('Google Maps no devolvió una ubicación válida.');
          const resolvedInput = parseGoogleMapsLocationInput(data.url, tipo);
          if (resolvedInput?.kind === 'coordinates') {
            void fijarCoordenadasDireccion(
              resolvedInput.coordinates.lat,
              resolvedInput.coordinates.lng,
              tipo
            );
            return;
          }
          if (resolvedInput?.kind === 'search') {
            buscarDireccionGeocoding(resolvedInput.query, tipo);
            return;
          }
          throw new Error('No pudimos extraer la ubicación. Pide que compartan el enlace completo de Google Maps.');
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error('No se pudo resolver el enlace compartido de Google Maps:', error);
          setInput(query);
          setErrorGeocoding(error instanceof Error
            ? error.message
            : 'No se pudo abrir el enlace de Google Maps.');
          setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
        }
      })();
      return;
    }

    if (parsedInput?.kind === 'unsupported') {
      setErrorGeocoding('No pudimos leer esa ubicación. Verifica que sea un enlace de Google Maps.');
      setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
      return;
    }

    const consulta = parsedInput?.kind === 'search' ? parsedInput.query.trim() : query.trim();
    if (consulta.length < 2) {
      autocompleteSessionTokensRef.current[tipo] = null;
      return;
    }

    debounceTimerRef.current[tipo] = setTimeout(async () => {
      const controller = new AbortController();
      geocodingControllerRef.current[tipo] = controller;
      try {
        const proximidad = coordsUsuarioGPS || { lat: 10.2291, lng: -68.0055 };
        const { places } = await loadGoogleMaps();
        const sessionToken = autocompleteSessionTokensRef.current[tipo]
          ?? new places.AutocompleteSessionToken();
        autocompleteSessionTokensRef.current[tipo] = sessionToken;
        const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: consulta,
          includedRegionCodes: ['ve'],
          language: 'es',
          region: 'VE',
          locationBias: { center: proximidad, radius: 40_000 },
          origin: proximidad,
          sessionToken
        });
        if (controller.signal.aborted) return;
        const formatted: SugerenciaDireccion[] = response.suggestions.flatMap(suggestion => {
          const prediction = suggestion.placePrediction;
          if (!prediction) return [];
          const displayName = prediction.text.toString().trim();
          if (!displayName) return [];
          return [{
            clase: 'prediccion' as const,
            display_name: displayName,
            tipo: tipoDireccionGoogle(prediction.types),
            prediction
          }];
        }).slice(0, 8);

        if (tipo === 'origen') setSugerenciasOrigen(formatted);
        else setSugerenciasDestino(formatted);
        setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Error buscando dirección en Google Places:', error);
        setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
        setErrorGeocoding(`${mensajeErrorGoogleMaps(error, 'Places API (New)')} Puedes marcar el punto exacto en el mapa.`);
      }
    }, 500);
  };

  const buscarLugaresPorTexto = async (consulta: string, tipo: 'origen' | 'destino') => {
    const texto = consulta.trim();
    if (texto.length < 2) return;

    if (debounceTimerRef.current[tipo]) clearTimeout(debounceTimerRef.current[tipo]!);
    geocodingControllerRef.current[tipo]?.abort();
    const controller = new AbortController();
    geocodingControllerRef.current[tipo] = controller;
    const setCoordenadas = tipo === 'origen' ? setCoordsOrigen : setCoordsDestino;
    const setSugerencias = tipo === 'origen' ? setSugerenciasOrigen : setSugerenciasDestino;
    setCoordenadas(null);
    setSugerencias([]);
    setBuscandoDireccion(current => ({ ...current, [tipo]: true }));
    setErrorGeocoding('');
    setErrorRuta('');
    setDistanciaKm(0);
    setTiempoEstimadoMin(0);
    autocompleteSessionTokensRef.current[tipo] = null;

    try {
      const proximidad = coordsUsuarioGPS || { lat: 10.2291, lng: -68.0055 };
      const { places } = await loadGoogleMaps();
      const response = await places.Place.searchByText({
        textQuery: texto,
        fields: ['displayName', 'formattedAddress', 'location', 'types'],
        maxResultCount: 20,
        language: 'es',
        region: 'VE',
        locationBias: { center: proximidad, radius: 40_000 }
      });
      if (controller.signal.aborted) return;
      const resultados: SugerenciaDireccion[] = response.places.flatMap(place => {
        if (!place.location) return [];
        const partes = [place.displayName?.trim(), place.formattedAddress?.trim()]
          .filter((parte): parte is string => Boolean(parte));
        const displayName = partes.filter((parte, indice) =>
          partes.findIndex(otra => otra.toLocaleLowerCase('es') === parte.toLocaleLowerCase('es')) === indice
        ).join(' · ');
        if (!displayName) return [];
        return [{
          clase: 'lugar',
          display_name: displayName,
          tipo: tipoDireccionGoogle(place.types ?? []),
          place
        }];
      });
      setSugerencias(resultados);
      if (resultados.length === 0) {
        setErrorGeocoding(`Google Maps no encontró lugares para “${texto}”. Prueba con otro nombre o marca el punto en el mapa.`);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Error buscando lugares en Google Maps:', error);
      setErrorGeocoding(`${mensajeErrorGoogleMaps(error, 'Places API (New)')} Puedes marcar el punto exacto en el mapa.`);
    } finally {
      if (!controller.signal.aborted) {
        setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
      }
    }
  };

  const seleccionarSugerencia = (item: SugerenciaDireccion, tipo: 'origen' | 'destino') => {
    geocodificacionGPSRef.current?.abort();
    if (debounceTimerRef.current[tipo]) clearTimeout(debounceTimerRef.current[tipo]!);
    geocodingControllerRef.current[tipo]?.abort();
    const controller = new AbortController();
    geocodingControllerRef.current[tipo] = controller;
    setErrorGeocoding('');
    setErrorRuta('');
    setBuscandoDireccion(current => ({ ...current, [tipo]: true }));
    setDistanciaKm(0);
    setTiempoEstimadoMin(0);
    autocompleteSessionTokensRef.current[tipo] = null;
    const setInput = tipo === 'origen' ? setOrigenInput : setDestinoInput;
    const setCoords = tipo === 'origen' ? setCoordsOrigen : setCoordsDestino;
    const setSugerencias = tipo === 'origen' ? setSugerenciasOrigen : setSugerenciasDestino;
    setInput(item.display_name);
    setModoSeleccionMapa(null);
    setCoords(null);
    setSugerencias([]);

    void (async () => {
      try {
        if (item.clase === 'lugar') {
          const location = item.place.location;
          if (!location) throw new Error('Google no devolvió las coordenadas del lugar seleccionado.');
          if (controller.signal.aborted) return;
          setCoords({ lat: location.lat(), lng: location.lng() });
          setInput(item.display_name);
        } else {
          const place = item.prediction.toPlace();
          const response = await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
          if (controller.signal.aborted) return;
          const location = response.place.location;
          if (!location) throw new Error('Google no devolvió las coordenadas del lugar seleccionado.');
          setCoords({ lat: location.lat(), lng: location.lng() });
          const partes = [response.place.displayName?.trim(), response.place.formattedAddress?.trim()]
            .filter((parte): parte is string => Boolean(parte));
          const direccion = partes.filter((parte, indice) =>
            partes.findIndex(otra => otra.toLocaleLowerCase('es') === parte.toLocaleLowerCase('es')) === indice
          ).join(' · ');
          setInput(direccion || item.display_name);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('No se pudieron obtener las coordenadas del lugar:', error);
        setErrorGeocoding(`${mensajeErrorGoogleMaps(error, 'Places API (New)')} Puedes marcarlo en el mapa.`);
      } finally {
        if (!controller.signal.aborted) {
          setBuscandoDireccion(current => ({ ...current, [tipo]: false }));
        }
      }
    })();
  };

  const manejarEnterEnDireccion = (
    event: React.KeyboardEvent<HTMLInputElement>,
    tipo: 'origen' | 'destino'
  ) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const sugerencia = tipo === 'origen' ? sugerenciasOrigen[0] : sugerenciasDestino[0];
    if (sugerencia) {
      seleccionarSugerencia(sugerencia, tipo);
      return;
    }
    void buscarLugaresPorTexto(tipo === 'origen' ? origenInput : destinoInput, tipo);
  };

  const cargarConfiguracionPago = useCallback(async () => {
    if (!usuario?.id) return;
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
  }, [usuario?.id]);

  const cargarTarifas = useCallback(async () => {
    if (!usuario?.id) return;
    setCargandoTarifas(true);
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pagos/tarifas`);
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudieron cargar las tarifas'));
      const data: { tarifas: ConfiguracionTarifas; tasas: TasasCambio | null; errorTasas?: string } = await response.json();
      setConfiguracionTarifas(data.tarifas);
      setTasasCambio(data.tasas);
      setErrorTarifas(data.errorTasas || '');
    } catch (error) {
      setErrorTarifas(error instanceof Error ? error.message : 'No se pudieron cargar las tarifas y tasas actuales.');
    } finally {
      setCargandoTarifas(false);
    }
  }, [usuario?.id]);

  useEffect(() => {
    if (!usuarioId) return;
    // Load and refresh the shared configuration for both web and Capacitor clients.
    // oxlint-disable-next-line react/set-state-in-effect
    void cargarTarifas();
    const interval = window.setInterval(() => void cargarTarifas(), 60_000);
    return () => clearInterval(interval);
  }, [usuarioId, cargarTarifas]);

  useEffect(() => {
    const consulta = busquedaAdmin.trim();
    const filtroValido = modoBusquedaAdmin === 'fecha'
      ? Boolean(fechaBusquedaAdmin || horaBusquedaAdmin)
      : consulta.length >= 2 && (modoBusquedaAdmin !== 'codigo' || /^\d+$/.test(consulta));
    if (!usuario?.es_admin || activeTab !== 'admin' || !filtroValido) return;

    let vigente = true;
    const timeout = window.setTimeout(() => {
      const cargarSugerencias = async () => {
        try {
          const parametros = crearParametrosBusquedaAdmin(
            modoBusquedaAdmin,
            consulta,
            fechaBusquedaAdmin,
            horaBusquedaAdmin
          );
          const response = await authenticatedFetch(`${API_URL}/api/pedidos/admin/buscar?${parametros}`);
          if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudieron cargar las sugerencias'));
          const data: { pedidos: PedidoBusquedaAdmin[] } = await response.json();
          if (vigente) {
            setSugerenciasBusquedaAdmin(Array.isArray(data.pedidos) ? data.pedidos : []);
            setErrorAutocompletadoAdmin('');
          }
        } catch (error) {
          if (vigente) {
            setSugerenciasBusquedaAdmin([]);
            setErrorAutocompletadoAdmin(error instanceof Error ? error.message : 'No se pudieron cargar las sugerencias.');
            console.error('Error al autocompletar la búsqueda de pedidos:', error);
          }
        }
      };
      void cargarSugerencias();
    }, 350);

    return () => {
      vigente = false;
      window.clearTimeout(timeout);
    };
  }, [
    activeTab,
    busquedaAdmin,
    fechaBusquedaAdmin,
    horaBusquedaAdmin,
    modoBusquedaAdmin,
    usuario?.es_admin
  ]);

  const irAPedidos = () => {
    setPasoSolicitud('tipo');
    navegarA('cliente');
    void cargarConfiguracionPago();
    void cargarTarifas();
  };

  const cargarPanelAdmin = async () => {
    if (!usuario?.es_admin) return;
    setCargandoAdmin(true);
    setErrorAdmin('');
    try {
      const [pagosResponse, configResponse, historialResponse, tarifasResponse, postulacionesResponse, archivosChatResponse] = await Promise.all([
        authenticatedFetch(`${API_URL}/api/pagos/admin/pendientes`),
        authenticatedFetch(`${API_URL}/api/pagos/config`),
        authenticatedFetch(`${API_URL}/api/pagos/admin/historial`),
        authenticatedFetch(`${API_URL}/api/pagos/tarifas`),
        authenticatedFetch(`${API_URL}/api/auth/admin/driver-applications`),
        authenticatedFetch(`${API_URL}/api/pedidos/admin/chat-archives`)
      ]);
      if (!pagosResponse.ok) throw new Error(await mensajeErrorApi(pagosResponse, 'No se pudieron cargar los pagos pendientes'));
      if (!configResponse.ok) throw new Error(await mensajeErrorApi(configResponse, 'No se pudo cargar la configuración de pago'));
      if (!historialResponse.ok) throw new Error(await mensajeErrorApi(historialResponse, 'No se pudo cargar el historial de pagos'));
      if (!tarifasResponse.ok) throw new Error(await mensajeErrorApi(tarifasResponse, 'No se pudieron cargar las tarifas'));
      if (!postulacionesResponse.ok) throw new Error(await mensajeErrorApi(postulacionesResponse, 'No se pudieron cargar las postulaciones'));
      if (!archivosChatResponse.ok) throw new Error(await mensajeErrorApi(archivosChatResponse, 'No se pudieron cargar los archivos de chat'));
      const pagosData = await pagosResponse.json();
      const configData: ConfiguracionPago = await configResponse.json();
      const historialData = await historialResponse.json();
      const tarifasData: { tarifas: ConfiguracionTarifas; tasas: TasasCambio | null; errorTasas?: string } = await tarifasResponse.json();
      const postulacionesData: PostulacionRepartidorAdmin[] = await postulacionesResponse.json();
      const archivosChatData: { archivos: ArchivoChatAdmin[] } = await archivosChatResponse.json();
      setPagosPendientesAdmin(Array.isArray(pagosData.pagos) ? pagosData.pagos : []);
      setPostulacionesAdmin(Array.isArray(postulacionesData) ? postulacionesData : []);
      setHistorialPagosAdmin(Array.isArray(historialData.historial) ? historialData.historial : []);
      setArchivosChatAdmin(Array.isArray(archivosChatData.archivos) ? archivosChatData.archivos : []);
      setConfiguracionPago(configData);
      setConfigPagoAdmin(configData.pagoMovil);
      setConfiguracionTarifas(tarifasData.tarifas);
      setConfiguracionTarifasAdmin(tarifasData.tarifas);
      setTasasCambio(tarifasData.tasas);
      setErrorTarifas(tarifasData.errorTasas || '');
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo cargar el panel de administración.');
    } finally {
      setCargandoAdmin(false);
    }
  };

  const descargarArchivoChatAdmin = async (pedidoId: number) => {
    setErrorAdmin('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pedidos/admin/chat-archives/${pedidoId}`);
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo descargar el archivo de chat'));
      const archivo = await response.blob();
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `chat-pedido-${pedidoId}.json.gz`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMensajeAdmin(`Archivo del pedido ${pedidoId} descargado.`);
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo descargar el archivo de chat.');
    }
  };

  const aprobarPostulacionRepartidor = async (postulacion: PostulacionRepartidorAdmin) => {
    const confirmado = window.confirm(
      `¿Confirmas que entrevistaste presencialmente a ${postulacion.nombre}, comprobaste su teléfono y revisaste su cédula y documentos originales? Solo entonces envía la aprobación.`
    );
    if (!confirmado) return;
    setErrorAdmin('');
    setMensajeAdmin('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/admin/driver-applications/${postulacion.id}/approve`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo aprobar la postulación'));
      const data = await response.json();
      setMensajeAdmin(data.mensaje || 'Postulación aprobada.');
      await cargarPanelAdmin();
    } catch (error) {
      await cargarPanelAdmin();
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo aprobar la postulación.');
    }
  };

  const rechazarPostulacionRepartidor = async (postulacion: PostulacionRepartidorAdmin) => {
    const motivo = window.prompt('Motivo interno opcional para el rechazo:');
    if (motivo === null) return;
    setErrorAdmin('');
    setMensajeAdmin('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/admin/driver-applications/${postulacion.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo rechazar la postulación'));
      const data = await response.json();
      setMensajeAdmin(data.mensaje || 'Postulación rechazada.');
      await cargarPanelAdmin();
    } catch (error) {
      await cargarPanelAdmin();
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo rechazar la postulación.');
    }
  };

  const reenviarInvitacionRepartidor = async (postulacion: PostulacionRepartidorAdmin) => {
    setErrorAdmin('');
    setMensajeAdmin('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/admin/driver-applications/${postulacion.id}/resend-invitation`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo reenviar la invitación'));
      const data = await response.json();
      setMensajeAdmin(data.mensaje || 'Invitación reenviada.');
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo reenviar la invitación.');
    }
  };

  const cargarMonitorAdmin = useCallback(async () => {
    if (!usuario?.es_admin) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/admin/monitor`);
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo cargar el monitor'));
      const data: { metricas: MetricasAdmin; actividad: ActividadAdmin[] } = await response.json();
      setMetricasAdmin(data.metricas);
      setActividadAdmin(Array.isArray(data.actividad) ? data.actividad : []);
    } catch (error) {
      console.error('Error al actualizar el monitor administrativo:', error);
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo cargar el monitor administrativo.');
    }
  }, [usuario?.es_admin]);

  useEffect(() => {
    if (!usuario?.es_admin || activeTab !== 'admin') return;
    // The dashboard refreshes separately from payment data to keep presence counters current.
    // oxlint-disable-next-line react/set-state-in-effect
    void cargarMonitorAdmin();
    const intervalo = window.setInterval(() => void cargarMonitorAdmin(), 15_000);
    return () => clearInterval(intervalo);
  }, [usuario?.id, usuario?.es_admin, activeTab, cargarMonitorAdmin]);

  const cambiarPerspectivaAdmin = async (rol: 'cliente' | 'repartidor') => {
    if (!usuario?.es_admin || usuario.rol === rol) return;
    setErrorAdmin('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/active-role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo cambiar la perspectiva'));
      const data: { token: string; usuario: UsuarioSesion } = await response.json();
      localStorage.setItem('llevalo_token', data.token);
      localStorage.setItem('llevalo_usuario', JSON.stringify(data.usuario));
      setUsuario(data.usuario);
      setPasoSolicitud(null);
      setMensajeAdmin('');
      navegarA('home');
      await sincronizarDatos();
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo cambiar la perspectiva.');
    }
  };

  const revisarPagoManual = async (pedidoId: number, accion: 'aprobar' | 'rechazar' | 'reembolsar' | 'sin_pago') => {
    const confirmacion = accion === 'rechazar'
      ? '¿Rechazar el pago y cancelar este pedido?'
      : accion === 'reembolsar'
        ? 'Confirma solo después de devolver el dinero al pasajero. ¿Ya realizaste el reembolso?'
        : accion === 'sin_pago' ? '¿Confirmas que no se recibió ningún pago por este pedido cancelado?' : '';
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
        accion === 'aprobar' ? 'Pago confirmado; el pedido ya puede aparecer en el radar.'
          : accion === 'rechazar' ? 'Pago rechazado y pedido cancelado.'
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

  const guardarTarifasAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorAdmin('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pagos/admin/tarifas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configuracionTarifasAdmin)
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudieron guardar las tarifas'));
      const data: { tarifas: ConfiguracionTarifas } = await response.json();
      setConfiguracionTarifas(data.tarifas);
      setConfiguracionTarifasAdmin(data.tarifas);
      setMensajeAdmin('Tarifas actualizadas. Los montos se muestran en bolívares a tasa BCV.');
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudieron guardar las tarifas.');
    }
  };

  const buscarPedidosAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    const consulta = busquedaAdmin.trim();
    const filtroValido = modoBusquedaAdmin === 'fecha'
      ? Boolean(fechaBusquedaAdmin || horaBusquedaAdmin)
      : consulta.length >= 2 && (modoBusquedaAdmin !== 'codigo' || /^\d+$/.test(consulta));
    if (!filtroValido) {
      setErrorAdmin(modoBusquedaAdmin === 'fecha'
        ? 'Selecciona una fecha, una hora o ambas para buscar.'
        : modoBusquedaAdmin === 'codigo'
          ? 'Escribe al menos dos números del código del pedido.'
          : 'Escribe al menos dos caracteres para buscar pedidos.');
      return;
    }
    setCargandoBusquedaAdmin(true);
    setErrorAdmin('');
    setMostrarSugerenciasAdmin(false);
    setErrorAutocompletadoAdmin('');
    setBusquedaEjecutadaAdmin(true);
    try {
      const parametros = crearParametrosBusquedaAdmin(
        modoBusquedaAdmin,
        consulta,
        fechaBusquedaAdmin,
        horaBusquedaAdmin
      );
      const response = await authenticatedFetch(`${API_URL}/api/pedidos/admin/buscar?${parametros}`);
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudieron buscar los pedidos'));
      const data: { pedidos: PedidoBusquedaAdmin[] } = await response.json();
      setResultadosBusquedaAdmin(Array.isArray(data.pedidos) ? data.pedidos : []);
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudieron buscar los pedidos.');
      setResultadosBusquedaAdmin([]);
    } finally {
      setCargandoBusquedaAdmin(false);
    }
  };

  const handleCrearPedido = async () => {
    if (!usuario) return;
    if (!configuracionTarifas) {
      alert(errorTarifas || 'Espera a que se carguen las tarifas y la tasa BCV.');
      void cargarTarifas();
      return;
    }
    if (metodoPagoViaje === 'pago_movil' && !tasasCambio) {
      alert(errorTarifas || 'Pago Móvil requiere que la tasa BCV esté disponible.');
      void cargarTarifas();
      return;
    }
    if (!rutaCompletaLista || esperandoNombreDireccion || !coordsOrigen || !coordsDestino || distanciaKm <= 0 || tiempoEstimadoMin <= 0) {
      alert('Completa el origen y destino, y espera a que se calcule la ruta.');
      return;
    }
    if (metodoPagoViaje === 'pago_movil' && !/^\d{1,100}$/.test(referenciaPago.trim())) {
      alert('Ingresa una referencia de Pago Móvil que contenga solo números.');
      return;
    }
    if (metodoPagoViaje === 'pago_movil'
      && !(configuracionPago?.pagoMovil.banco
        && configuracionPago.pagoMovil.telefono
        && configuracionPago.pagoMovil.cedula
        && configuracionPago.pagoMovil.titular)) {
      alert('Pago Móvil todavía no está configurado por Llévalo. Inténtalo más tarde.');
      return;
    }
    setEnviandoPedido(true);

    try {
      const res = await authenticatedFetch(`${API_URL}/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: usuario.id,
          cliente_nombre: usuario.nombre,
          cliente_foto: fotoLocal || usuario.foto || '',
          tipo_servicio: serviceType,
          descripcion: serviceType === 'viajes' ? 'Servicio de viaje' : 'Servicio de envíos',
          origen_texto: origenInput.trim().slice(0, 300),
          origen_lat: coordsOrigen.lat, origen_lon: coordsOrigen.lng,
          destino_texto: destinoInput.trim().slice(0, 300),
          destino_lat: coordsDestino.lat, destino_lon: coordsDestino.lng,
          distancia_km: distanciaKm, tiempo_min: tiempoEstimadoMin, tarifa: tarifaTotal,
          metodo_pago: metodoPagoViaje,
          referencia_pago: metodoPagoViaje === 'pago_movil' ? referenciaPago.trim() : undefined
        })
      });
      if (!res.ok) throw new Error(await mensajeErrorApi(res, 'No se pudo publicar el pedido'));
      setOrigenInput(''); setDestinoInput('');
      setReferenciaPago('');
      setCoordsOrigen(null); setCoordsDestino(null);
      setDistanciaKm(0); setTiempoEstimadoMin(0);
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

  const postularsePedido = async (pedidoId: number): Promise<boolean> => {
    if (!usuario || usuario.rol !== 'repartidor') return false;
    try {
      const res = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/postular`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(await mensajeErrorApi(res, 'No se pudo enviar la postulación'));
      await sincronizarDatos();
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo enviar la postulación.');
      return false;
    }
  };

  const postularsePedidoRef = useRef(postularsePedido);
  useEffect(() => {
    postularsePedidoRef.current = postularsePedido;
  });
  const manejarAccionAviso = useCallback(async (action: string, orderId: number | null) => {
    if (action === 'ignore') return;
    if (action !== 'apply' || orderId === null) {
      if (usuario?.rol === 'repartidor') setActiveTab('repartidor');
      return;
    }
    if (usuario?.rol !== 'repartidor') {
      setActiveTab('auth');
      alert('Inicia sesión como repartidor para postularte a este trabajo.');
      return;
    }
    if (!repartidorOnline) {
      setActiveTab('repartidor');
      alert('Conéctate desde el radar antes de postularte a un trabajo.');
      return;
    }
    setActiveTab('repartidor');
    await postularsePedidoRef.current(orderId);
  }, [repartidorOnline, usuario]);
  const manejarAccionAvisoRef = useRef(manejarAccionAviso);
  useEffect(() => {
    manejarAccionAvisoRef.current = manejarAccionAviso;
  }, [manejarAccionAviso]);

  const manejarAccionPagoAdmin = (orderId: number | null) => {
    if (!usuario) {
      pagoAdminNotificacionPendienteRef.current = orderId;
      setActiveTab('auth');
      return;
    }
    if (!usuario.es_admin) {
      alert('Inicia sesión con una cuenta de administrador para revisar este pago.');
      return;
    }
    setPagoNotificadoId(orderId);
    setSeccionAdmin('pagos');
    navegarA('admin');
    void cargarPanelAdmin();
  };
  const manejarAccionPagoAdminRef = useRef(manejarAccionPagoAdmin);
  useEffect(() => {
    manejarAccionPagoAdminRef.current = manejarAccionPagoAdmin;
  });

  useEffect(() => {
    const orderId = pagoAdminNotificacionPendienteRef.current;
    if (orderId === null || !usuario) return;
    pagoAdminNotificacionPendienteRef.current = null;
    if (usuario.es_admin) {
      manejarAccionPagoAdminRef.current(orderId);
      return;
    }
    alert('La cuenta no tiene permisos de administrador para revisar este pago.');
  }, [usuario]);

  const activarAvisosAdmin = async () => {
    try {
      const permission = await requestAppNotificationPermission();
      setPermisoAvisosAdmin(permission);
      if (permission !== 'granted') {
        setErrorAvisosAdmin(permission === 'unsupported'
          ? 'Este dispositivo no admite notificaciones push.'
          : permission === 'denied'
            ? 'Habilita las notificaciones de Llévalo en los ajustes del dispositivo o navegador.'
            : 'No se concedió el permiso de notificaciones.');
      } else {
        setErrorAvisosAdmin('');
        setIntentoAvisosAdmin(intento => intento + 1);
      }
    } catch (error) {
      console.error('No se pudo solicitar el permiso de avisos de pago:', error);
      setErrorAvisosAdmin(error instanceof Error ? error.message : 'No se pudo activar el permiso de notificaciones.');
    }
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let descartado = false;
    const listeners: PluginListenerHandle[] = [];
    void LocalNotifications.addListener('localNotificationActionPerformed', event => {
      const extra = event.notification.extra as { orderId?: unknown } | undefined;
      const orderId = typeof extra?.orderId === 'number' && Number.isSafeInteger(extra.orderId)
        ? extra.orderId
        : null;
      void manejarAccionAvisoRef.current(event.actionId, orderId);
    }).then(handle => {
      if (descartado) void handle.remove();
      else listeners.push(handle);
    }).catch(error => console.error('No se pudieron escuchar las acciones de notificación:', error));
    return () => {
      descartado = true;
      listeners.forEach(listener => void listener.remove());
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()
      || usuario?.rol !== 'repartidor'
      || !avisosRepartidorActivos
      || permisoAvisosRepartidor !== 'granted') return;

    let descartado = false;
    let errorPushMostrado = false;
    const listeners: PluginListenerHandle[] = [];
    const guardar = (handle: PluginListenerHandle) => {
      if (descartado) void handle.remove();
      else listeners.push(handle);
    };
    const manejarErrorPush = (error: unknown) => {
      console.error('No se pudo configurar Firebase Push en este dispositivo:', error);
      if (descartado || errorPushMostrado) return;
      errorPushMostrado = true;
      localStorage.setItem(`llevalo_driver_notifications_${usuario.id}`, 'false');
      setAvisosRepartidorActivos(false);
      alert('No se pudieron activar las notificaciones push de Android. Verifica la configuración de Firebase e inténtalo de nuevo.');
    };

    const iniciarPush = async () => {
      try {
        guardar(await PushNotifications.addListener('registration', event => {
          if (descartado
            || localStorage.getItem(`llevalo_driver_notifications_${usuario.id}`) !== 'true') return;
          const token = event.value;
          localStorage.setItem(`llevalo_push_token_${usuario.id}`, token);
          void guardarTokenPush(token, 'android', disponiblePushRepartidorRef.current)
            .catch(manejarErrorPush);
        }));

        guardar(await PushNotifications.addListener('registrationError', error => {
          manejarErrorPush(error);
        }));

        guardar(await PushNotifications.addListener('pushNotificationActionPerformed', event => {
          const data = event.notification.data as Record<string, unknown> | undefined;
          if (data?.kind === 'admin_payment_pending') return;
          const orderId = Number(data?.orderId);
          void manejarAccionAvisoRef.current(
            event.actionId === 'apply' ? 'apply' : 'open',
            Number.isSafeInteger(orderId) && orderId > 0 ? orderId : null
          );
        }));

        await PushNotifications.register();
      } catch (error) {
        manejarErrorPush(error);
        listeners.forEach(listener => void listener.remove());
      }
    };
    void iniciarPush();
    return () => {
      descartado = true;
      listeners.forEach(listener => void listener.remove());
    };
  }, [avisosRepartidorActivos, permisoAvisosRepartidor, usuario?.id, usuario?.rol]);

  useEffect(() => {
    if (!usuario?.es_admin) return;
    let descartado = false;
    void getDriverNotificationPermission().then(permission => {
      if (!descartado) setPermisoAvisosAdmin(permission);
    }).catch(error => {
      if (descartado) return;
      console.error('No se pudo consultar el permiso de notificaciones del administrador:', error);
      setPermisoAvisosAdmin('unsupported');
    });
    return () => { descartado = true; };
  }, [usuario?.es_admin, usuario?.id]);

  useEffect(() => {
    if (!usuario?.es_admin || permisoAvisosAdmin !== 'granted') {
      return;
    }

    let descartado = false;
    const listeners: PluginListenerHandle[] = [];
    const guardar = (handle: PluginListenerHandle) => {
      if (descartado) void handle.remove();
      else listeners.push(handle);
    };
    const registrarToken = async (token: string, platform: 'android' | 'web') => {
      if (descartado) return;
      await guardarTokenPush(token, platform, true);
      if (descartado) return;
      localStorage.setItem(`llevalo_push_token_${usuario.id}`, token);
      setErrorAvisosAdmin('');
      setAvisosAdminActivos(true);
    };
    const manejarError = (error: unknown) => {
      if (descartado) return;
      console.error('No se pudieron activar las notificaciones de pagos para el administrador:', error);
      setAvisosAdminActivos(false);
      setErrorAvisosAdmin(error instanceof Error ? error.message : 'No se pudieron activar los avisos de pagos.');
    };

    const iniciarRegistro = async () => {
      if (Capacitor.isNativePlatform()) {
        guardar(await PushNotifications.addListener('registration', event => {
          void registrarToken(event.value, 'android').catch(manejarError);
        }));
        guardar(await PushNotifications.addListener('registrationError', manejarError));
        guardar(await PushNotifications.addListener('pushNotificationActionPerformed', event => {
          const data = event.notification.data as Record<string, unknown> | undefined;
          if (data?.kind !== 'admin_payment_pending') return;
          const orderId = Number(data.orderId);
          void manejarAccionPagoAdminRef.current(
            Number.isSafeInteger(orderId) && orderId > 0 ? orderId : null
          );
        }));
        await PushNotifications.register();
        return;
      }

      const token = await registerWebPushToken();
      if (descartado) return;
      await registrarToken(token, 'web');
    };
    void iniciarRegistro().catch(manejarError);

    return () => {
      descartado = true;
      listeners.forEach(listener => void listener.remove());
    };
  }, [intentoAvisosAdmin, permisoAvisosAdmin, usuario?.es_admin, usuario?.id]);

  useEffect(() => {
    let descartado = false;
    let notificacionesSolicitadas = false;
    let ubicacionPendiente = false;
    const pedirNotificaciones = () => {
      if (notificacionesSolicitadas) return;
      notificacionesSolicitadas = true;
      void requestAppNotificationPermission()
        .then(permission => {
          if (!descartado) setPermisoAvisosAdmin(permission);
        })
        .catch(error => {
          if (!descartado) console.error('No se pudo solicitar el permiso de notificaciones:', error);
        });
    };

    if (!navigator.geolocation) {
      // oxlint-disable-next-line react/set-state-in-effect
      setErrorUbicacion('Este dispositivo o navegador no permite acceder a la ubicación.');
      setUbicacionCargando(false);
      pedirNotificaciones();
      return () => { descartado = true; };
    }

    const solicitarUbicacion = (forzar = false) => {
      if (descartado || (!forzar && coordsUsuarioGPSRef.current) || ubicacionPendiente) return;
      ubicacionPendiente = true;
      if (forzar) setUbicacionCargando(true);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          ubicacionPendiente = false;
          if (descartado) return;
          const location = { lat: coords.latitude, lng: coords.longitude };
          coordsUsuarioGPSRef.current = location;
          setCoordsUsuarioGPS(location);
          setUbicacionCargando(false);
          setErrorUbicacion('');
          pedirNotificaciones();
        },
        (error) => {
          ubicacionPendiente = false;
          if (descartado) return;
          coordsUsuarioGPSRef.current = null;
          setCoordsUsuarioGPS(null);
          setErrorUbicacion(error.code === error.PERMISSION_DENIED
            ? 'Activa el permiso de ubicación para usar Llévalo.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Activa la ubicación del dispositivo para continuar.'
              : 'No se pudo obtener tu ubicación. Comprueba el GPS e inténtalo de nuevo.');
          setUbicacionCargando(false);
          pedirNotificaciones();
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 }
      );
    };
    const retryAfterSettings = () => {
      if (!document.hidden) solicitarUbicacion(true);
    };
    document.addEventListener('visibilitychange', retryAfterSettings);
    solicitarUbicacion();

    return () => {
      descartado = true;
      document.removeEventListener('visibilitychange', retryAfterSettings);
    };
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()
      || usuario?.rol !== 'repartidor'
      || !avisosRepartidorActivos
      || permisoAvisosRepartidor !== 'granted') return;

    let descartado = false;
    void registerWebPushToken()
      .then(async token => {
        if (descartado) return;
        await guardarTokenPush(token, 'web', disponiblePushRepartidor);
        if (descartado
          || localStorage.getItem(`llevalo_driver_notifications_${usuario.id}`) !== 'true') {
          await retirarTokenPush(token);
          return;
        }
        localStorage.setItem(`llevalo_push_token_${usuario.id}`, token);
      })
      .catch(error => {
        if (descartado) return;
        console.error('No se pudo registrar el token push web:', error);
        localStorage.setItem(`llevalo_driver_notifications_${usuario.id}`, 'false');
        setAvisosRepartidorActivos(false);
        alert(error instanceof Error ? error.message : 'No se pudieron activar las notificaciones web.');
      });
    return () => {
      descartado = true;
    };
  }, [avisosRepartidorActivos, disponiblePushRepartidor, permisoAvisosRepartidor, usuario?.id, usuario?.rol]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const recibirAccion = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== 'object') return;
      const data = event.data as { type?: unknown; action?: unknown; orderId?: unknown };
      const orderId = typeof data.orderId === 'number' && Number.isSafeInteger(data.orderId)
        ? data.orderId
        : null;
      if (data.type === 'admin-payment-notification-action') {
        manejarAccionPagoAdminRef.current(orderId);
        return;
      }
      if (data.type === 'driver-notification-action' && typeof data.action === 'string') {
        void manejarAccionAvisoRef.current(data.action, orderId);
      }
    };
    navigator.serviceWorker.addEventListener('message', recibirAccion);
    return () => navigator.serviceWorker.removeEventListener('message', recibirAccion);
  }, []);

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
        body: JSON.stringify({ repartidor_id: post.repartidor_id })
      });
      if (!res.ok) throw new Error(await mensajeErrorApi(res, 'No se pudo aceptar la postulación'));
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
  };

  const chatSoloLectura = (pedido: PedidoReal) =>
    pedido.estado === 'completado' || pedido.estado === 'cancelado';
  const chatSoloLecturaPorId = (pedidoId: number) => {
    const pedido = pedidosReales.find(item => item.id === pedidoId);
    return !pedido || chatSoloLectura(pedido);
  };

  const enviarMensaje = async (pedidoId: number) => {
    if (!usuario || !nuevoMensajeTexto.trim() || chatSoloLecturaPorId(pedidoId)) return;
    setErrorChat('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remitente_id: usuario.id, remitente_nombre: usuario.nombre, mensaje: nuevoMensajeTexto })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo enviar el mensaje.'));
      setNuevoMensajeTexto('');
      await sincronizarDatos();
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      setErrorChat(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    }
  };

  const enviarAdjuntoChat = async (
    pedidoId: number,
    archivo: Blob,
    tipo: 'imagen' | 'audio',
    nombre: string
  ) => {
    if (chatSoloLecturaPorId(pedidoId)) return;
    if (archivo.size === 0) {
      setErrorChat('El archivo está vacío.');
      return;
    }
    if (archivo.size > 10 * 1024 * 1024) {
      setErrorChat('Cada imagen o audio puede pesar hasta 10 MB.');
      return;
    }
    setErrorChat('');
    const parametros = new URLSearchParams({
      tipo,
      nombre,
      caption: nuevoMensajeTexto.trim()
    });
    try {
      const response = await authenticatedFetch(`${API_URL}/api/pedidos/${pedidoId}/chat/media?${parametros}`, {
        method: 'POST',
        headers: { 'Content-Type': archivo.type },
        body: archivo
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo enviar el archivo.'));
      setNuevoMensajeTexto('');
      await sincronizarDatos();
    } catch (error) {
      console.error('Error al enviar archivo de chat:', error);
      setErrorChat(error instanceof Error ? error.message : 'No se pudo enviar el archivo.');
    }
  };

  const alternarGrabacionAudio = async (pedidoId: number) => {
    const grabadoraActual = grabadoraChatRef.current;
    if (grabadoraActual?.state === 'recording') {
      grabadoraActual.stop();
      return;
    }
    if (chatSoloLecturaPorId(pedidoId)) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorChat('Este navegador no permite grabar audio. Actualiza la app o usa el navegador del dispositivo.');
      return;
    }

    setErrorChat('');
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      flujoAudioChatRef.current = flujo;
      const formato = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(tipo => MediaRecorder.isTypeSupported(tipo));
      const grabadora = formato ? new MediaRecorder(flujo, { mimeType: formato }) : new MediaRecorder(flujo);
      const fragmentos: Blob[] = [];
      grabadora.ondataavailable = event => {
        if (event.data.size > 0) fragmentos.push(event.data);
      };
      grabadora.onerror = () => {
        setErrorChat('No se pudo grabar el audio. Revisa el permiso del micrófono e inténtalo de nuevo.');
        flujo.getTracks().forEach(track => track.stop());
        setGrabandoAudio(false);
      };
      grabadora.onstop = () => {
        const audio = new Blob(fragmentos, { type: grabadora.mimeType || 'audio/webm' });
        flujo.getTracks().forEach(track => track.stop());
        flujoAudioChatRef.current = null;
        setGrabandoAudio(false);
        grabadoraChatRef.current = null;
        if (audio.size > 0) void enviarAdjuntoChat(pedidoId, audio, 'audio', `audio-${Date.now()}.webm`);
      };
      grabadoraChatRef.current = grabadora;
      grabadora.start();
      setGrabandoAudio(true);
    } catch (error) {
      console.error('No se pudo activar el micrófono para el chat:', error);
      setErrorChat(error instanceof Error
        ? `No se pudo activar el micrófono: ${error.message}`
        : 'No se pudo activar el micrófono. Revisa los permisos del dispositivo.');
    }
  };

  const renderChatPedido = (pedido: PedidoReal) => {
    const soloLectura = chatSoloLectura(pedido);
    return (
    <section className={`space-y-3 rounded-2xl border p-3 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`} aria-label={`Chat privado del pedido ${pedido.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className={`text-xs font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Chat privado con {usuario?.rol === 'cliente' ? pedido.repartidor_nombre || 'el repartidor' : pedido.cliente_nombre}</h4>
          <p className="text-[10px] text-slate-500">Mensajes, imágenes y audios · se conserva 7 días tras finalizar</p>
        </div>
      </div>
      <div className={`max-h-64 space-y-2 overflow-y-auto rounded-xl p-2 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
        {mensajesChat.filter(mensaje => mensaje.pedido_id === pedido.id).map(mensaje => (
          <article key={mensaje.id} className={`max-w-[90%] rounded-xl p-2 text-xs ${mensaje.remitente_id === usuario?.id ? 'ml-auto bg-[#FF5722] text-white' : darkMode ? 'bg-slate-800 text-slate-100' : 'border border-slate-100 bg-slate-50 text-slate-800'}`}>
            <p className="text-[9px] font-bold opacity-75">{mensaje.remitente_nombre}</p>
            {mensaje.tipo === 'imagen' && (urlsAdjuntosChat[mensaje.id]
              ? <img src={urlsAdjuntosChat[mensaje.id]} alt={mensaje.media_nombre || 'Imagen enviada en el chat'} className="mt-1 max-h-56 rounded-lg object-contain" />
              : <p className="mt-1 opacity-75">Cargando imagen…</p>)}
            {mensaje.tipo === 'audio' && (urlsAdjuntosChat[mensaje.id]
              ? <audio controls preload="metadata" src={urlsAdjuntosChat[mensaje.id]} className="mt-1 max-w-full" />
              : <p className="mt-1 opacity-75">Cargando audio…</p>)}
            {mensaje.mensaje && <p className="mt-1 whitespace-pre-wrap break-words">{mensaje.mensaje}</p>}
            {mensaje.creado_en && <time className="mt-1 block text-[9px] opacity-60">{new Date(mensaje.creado_en).toLocaleString('es-VE')}</time>}
          </article>
        ))}
        {mensajesChat.every(mensaje => mensaje.pedido_id !== pedido.id) && <p className="py-3 text-center text-[10px] text-slate-500">{soloLectura ? 'Aún no hay mensajes.' : 'Aún no hay mensajes. Puedes escribirle cuando quieras.'}</p>}
      </div>
      {!soloLectura && (
        <>
          <div className="flex items-center gap-2">
            <input type="text" value={nuevoMensajeTexto} onChange={event => setNuevoMensajeTexto(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void enviarMensaje(pedido.id); }} maxLength={2000} placeholder="Escribe un mensaje..." className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${darkMode ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`} />
            <button type="button" aria-label="Adjuntar imagen" onClick={() => { pedidoChatAdjuntoRef.current = pedido.id; inputAdjuntoChatRef.current?.click(); }} className="rounded-xl border border-slate-200 p-2 text-slate-600 dark:border-slate-700 dark:text-slate-200"><ImagePlus size={17} /></button>
            <button type="button" aria-label={grabandoAudio ? 'Detener grabación de audio' : 'Grabar audio'} onClick={() => void alternarGrabacionAudio(pedido.id)} className={`rounded-xl p-2 text-white ${grabandoAudio ? 'bg-red-600' : 'bg-emerald-600'}`}>{grabandoAudio ? <MicOff size={17} /> : <Mic size={17} />}</button>
            <button type="button" aria-label="Enviar mensaje" onClick={() => void enviarMensaje(pedido.id)} disabled={!nuevoMensajeTexto.trim()} className="rounded-xl bg-[#FF5722] p-2 text-white disabled:opacity-50"><Send size={17} /></button>
          </div>
          {grabandoAudio && <p role="status" className="text-[10px] font-semibold text-red-600">Grabando… pulsa el micrófono de nuevo para enviar el audio.</p>}
          {errorChat && <p role="alert" className="text-[10px] font-semibold text-red-600">{errorChat}</p>}
        </>
      )}
    </section>
    );
  };

  const cambiarEstadoPedido = useCallback(async (pedidoId: number, nuevoEstado: 'entregado_repartidor' | 'completado' | 'cancelado') => {
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
  }, [sincronizarDatos]);

  const guardarSesionAutenticada = (data: { token: string; usuario: UsuarioSesion }) => {
    localStorage.setItem('llevalo_token', data.token);
    localStorage.setItem('llevalo_usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
    setCedulaNumero(data.usuario.cedula?.replace(/^[VvEe]-/, '') || '');
    setTipoCedula(data.usuario.cedula?.toUpperCase().startsWith('E-') ? 'E' : 'V');
    setFotoLocal(data.usuario.foto || '');
    setTipoVehiculo(data.usuario.vehiculo || 'Moto Suzuki GN 125');
    setPlacaVehiculo(data.usuario.placa || '');
    setRegistroPendiente(null);
    setAccionCorreo(null);
    historialNavegacionRef.current = [];
    setActiveTab('home');
  };

  const reenviarVerificacionCorreo = async () => {
    if (registroPendiente && registroPendiente.etapa !== 'correo') return;
    const correo = registroPendiente?.email || email.trim();
    if (!correo) {
      setErrorAuth('Escribe el correo al que enviamos el código.');
      return;
    }
    setErrorAuth('');
    setMensajeAuth('');
    try {
      assertApiConfigured();
      const response = await fetch(`${API_URL}/api/auth/email-verification/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: correo,
          ...(registroPendiente ? { tipo: registroPendiente.tipo } : {})
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo reenviar el correo.');
      setCodigoCorreo('');
      setMensajeAuth(data.mensaje || 'Si hay una verificación pendiente, recibirás un nuevo código.');
    } catch (error) {
      setErrorAuth(error instanceof Error ? error.message : 'No se pudo reenviar el correo.');
    }
  };

  const verificarCodigoCorreo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!registroPendiente || registroPendiente.etapa !== 'correo') return;
    setErrorAuth('');
    setMensajeAuth('');
    try {
      assertApiConfigured();
      const response = await fetch(`${API_URL}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registroPendiente.email,
          tipo: registroPendiente.tipo,
          codigo: codigoCorreo
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo verificar el código.');

      setCodigoCorreo('');
      setMensajeAuth(data.mensaje || 'Correo confirmado.');
      if (data.tipo === 'repartidor') {
        setRegistroPendiente({
          email: '',
          tipo: 'repartidor',
          etapa: 'revision',
          mensaje: data.mensaje || 'Tu postulación está lista para revisión del administrador.'
        });
        setAuthMode('pending');
      } else {
        setRegistroPendiente(null);
        setAuthMode('login');
      }
    } catch (error) {
      setErrorAuth(error instanceof Error ? error.message : 'No se pudo verificar el código.');
    }
  };

  const ejecutarAccionCorreo = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!accionCorreo) return;
    setErrorAuth('');
    setMensajeAuth('');

    if (accionCorreo.tipo === 'activar-repartidor' && password !== confirmarPassword) {
      setErrorAuth('Las contraseñas no coinciden.');
      return;
    }
    if (accionCorreo.tipo === 'activar-repartidor' && !passwordCompleta) {
      setErrorAuth('Completa todos los requisitos de seguridad de la contraseña.');
      return;
    }

    try {
      assertApiConfigured();
      const endpoint = accionCorreo.tipo === 'verificar'
        ? '/api/auth/verify-email'
        : '/api/auth/driver-applications/activate';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accionCorreo.tipo === 'verificar'
          ? { token: accionCorreo.token }
          : { token: accionCorreo.token, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo completar esta acción.');

      if (accionCorreo.tipo === 'activar-repartidor') {
        if (typeof data.token !== 'string' || !data.usuario) {
          throw new Error('La activación no devolvió una sesión válida. Contacta al administrador.');
        }
        guardarSesionAutenticada({ token: data.token, usuario: data.usuario as UsuarioSesion });
        return;
      }

      setAccionCorreo(null);
      setPassword('');
      setConfirmarPassword('');
      setMensajeAuth(data.mensaje || 'Correo confirmado.');
      if (data.tipo === 'repartidor') {
        setRegistroPendiente({
          email: '',
          tipo: 'repartidor',
          etapa: 'revision',
          mensaje: data.mensaje || 'Tu postulación está lista para revisión del administrador.'
        });
        setAuthMode('pending');
      } else {
        setAuthMode('login');
      }
    } catch (error) {
      setErrorAuth(error instanceof Error ? error.message : 'No se pudo completar esta acción.');
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const esRegistro = authMode === 'register';
    const esPostulacion = esRegistro && authRoleSelection === 'repartidor';
    if (esRegistro && !esPostulacion && !passwordCompleta) {
      setErrorAuth('Completa todos los requisitos de seguridad de la contraseña.');
      return;
    }
    if (esRegistro && !/^\d{5,10}$/.test(cedulaNumero.trim())) {
      setErrorAuth('Ingresa una cédula válida de 5 a 10 dígitos.');
      return;
    }
    if (esPostulacion && (errorPlaca || !placaVehiculo.trim())) {
      setErrorAuth(errorPlaca || 'Ingresa la placa del vehículo.');
      return;
    }
    setErrorAuth('');
    setMensajeAuth('');

    const payload = !esRegistro
      ? { email, password }
      : esPostulacion
        ? {
            nombre,
            email,
            telefono,
            cedula: `${tipoCedula}-${cedulaNumero.trim()}`,
            vehiculo: tipoVehiculo,
            placa: placaVehiculo.trim().toUpperCase()
          }
        : { nombre, email, telefono, cedula: `${tipoCedula}-${cedulaNumero.trim()}`, password, rol: 'cliente' };
    const endpoint = !esRegistro
      ? '/api/auth/login'
      : esPostulacion
        ? '/api/auth/driver-applications'
        : '/api/auth/register';

    try {
      assertApiConfigured();
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.verificacion_pendiente === true) {
        setCodigoCorreo('');
        setRegistroPendiente({
          email: typeof data.email === 'string' ? data.email : email.trim(),
          tipo: data.tipo === 'repartidor' ? 'repartidor' : 'cliente',
          etapa: 'correo',
          mensaje: data.error || data.mensaje || 'Confirma tu correo para continuar.'
        });
        setAuthMode('pending');
        setPassword('');
        setMensajeAuth('');
        setErrorAuth('');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Error en autenticación');
      if (typeof data.token !== 'string' || !data.usuario) {
        throw new Error('El servidor no devolvió una sesión válida.');
      }
      guardarSesionAutenticada({ token: data.token, usuario: data.usuario as UsuarioSesion });
    } catch (error) {
      setErrorAuth(error instanceof Error ? error.message : 'Error en autenticación.');
    }
  };

  const guardarFotoPerfil = async (foto: string) => {
    if (!usuario) return;
    const fotoAnterior = fotoLocal;
    setFotoLocal(foto);
    setGuardandoPerfil(true);
    setErrorPerfil('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foto,
          ...(usuario.rol === 'repartidor' ? {
            vehiculo: tipoVehiculo,
            placa: placaVehiculo,
            vehiculo_foto: fotoVehiculoLocal
          } : {})
        })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo actualizar la foto'));
      const data = await response.json();
      const actualizado: UsuarioSesion = data.usuario;
      setUsuario(actualizado);
      setFotoLocal(actualizado.foto || '');
      localStorage.setItem('llevalo_usuario', JSON.stringify(actualizado));
    } catch (error) {
      setFotoLocal(fotoAnterior);
      setErrorPerfil(error instanceof Error ? error.message : 'No se pudo actualizar la foto de perfil.');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const manejarCambioFotoPerfil = (event: React.ChangeEvent<HTMLInputElement>) => {
    convertirImagenSegura(event, foto => { void guardarFotoPerfil(foto); });
    event.target.value = '';
  };

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario) return;
    setGuardandoPerfil(true);
    setErrorPerfil('');
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      setPasoSolicitud(null);
      navegarA('home');
    } catch (error) {
      setErrorPerfil(error instanceof Error ? error.message : 'No se pudo guardar el perfil.');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const handleLogout = () => {
    const token = localStorage.getItem('llevalo_token');
    if (usuario?.rol === 'repartidor') {
      localStorage.setItem(`llevalo_driver_notifications_${usuario.id}`, 'false');
      localStorage.setItem(`llevalo_driver_online_${usuario.id}`, 'false');
      setAvisosRepartidorActivos(false);
      setRepartidorOnline(false);
      void actualizarDisponibilidadPush(false)
        .catch(error => console.error('No se pudo marcar al repartidor como desconectado:', error));
    }
    const tokenPush = usuario?.rol === 'repartidor' || usuario?.es_admin
      ? localStorage.getItem(`llevalo_push_token_${usuario.id}`)
      : null;
    if (tokenPush) {
      void retirarTokenPush(tokenPush)
        .catch(error => console.error('No se pudo retirar el token push al cerrar sesión:', error));
      localStorage.removeItem(`llevalo_push_token_${usuario?.id}`);
    }
    if (token) {
      void fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true
      }).then(response => {
        if (!response.ok) console.error('No se pudo registrar el cierre de sesión.');
      }).catch(error => console.error('Error registrando el cierre de sesión:', error));
    }
    localStorage.removeItem('llevalo_token');
    localStorage.removeItem('llevalo_usuario');
    setUsuario(null);
    setAvisosAdminActivos(false);
    setPedidosCargadosUsuarioId(null);
    snapshotAvisosRepartidorRef.current = null;
    ultimoBloqueTemporizadorRef.current.clear();
    historialNavegacionRef.current = [];
    setActiveTab('home');
  };

  const pedidoActivoCliente = usuario?.rol === 'cliente' && Array.isArray(pedidosReales)
    ? pedidosReales.find(p => p.cliente_id === usuario.id && p.estado !== 'completado' && p.estado !== 'cancelado')
    : null;

  const pedidoExpiradoReciente = usuario?.rol === 'cliente' && Array.isArray(pedidosReales)
    ? pedidosReales.find(p => p.cliente_id === usuario.id
      && (p.motivo_cancelacion === 'sin_repartidor' || p.motivo_cancelacion === 'repartidor_cancelado'))
    : null;

  const segundosRestantes = (() => {
    if (pedidoActivoCliente?.estado !== 'pendiente' || !pedidoActivoCliente.publicado_en) return null;
    const vencimiento = Date.parse(pedidoActivoCliente.publicado_en) + 60_000;
    return Number.isFinite(vencimiento) ? Math.max(0, Math.ceil((vencimiento - horaActual) / 1000)) : null;
  })();

  const postulacionesPedidoActual = pedidoActivoCliente && Array.isArray(postulacionesReales)
    ? postulacionesReales.filter(p => p.pedido_id === pedidoActivoCliente.id) 
    : [];

  const pedidosVisiblesRepartidor = usuario?.rol === 'repartidor' && Array.isArray(pedidosReales)
    ? pedidosReales.filter(p =>
      (disponiblePushRepartidor && (p.estado === 'pendiente' || p.estado === 'postulado'))
      || (p.estado === 'aceptado' && p.repartidor_id === usuario.id)
      || (p.estado === 'entregado_repartidor' && p.repartidor_id === usuario.id))
    : [];

  const pedidoAsignadoRepartidor = usuario?.rol === 'repartidor' && Array.isArray(pedidosReales)
    ? pedidosReales.find(p => p.repartidor_id === usuario.id && (p.estado === 'aceptado' || p.estado === 'entregado_repartidor'))
    : null;
  const pedidoAsignadoRepartidorId = pedidoAsignadoRepartidor?.id;
  const pedidosChatCompletados = pedidosReales
    .filter(pedido => pedido.estado === 'completado'
      && Boolean(pedido.completado_en)
      && Date.parse(pedido.completado_en || '') > horaActual - 7 * 24 * 60 * 60 * 1000
      && (pedido.cliente_id === usuario?.id || pedido.repartidor_id === usuario?.id))
    .sort((primero, segundo) => Date.parse(segundo.completado_en || '') - Date.parse(primero.completado_en || ''));
  const pedidosHistorialCliente = usuario?.rol === 'cliente'
    ? pedidosReales
      .filter(pedido => pedido.cliente_id === usuario.id
        && pedido.estado !== 'cancelado')
      .sort((primero, segundo) => Date.parse(segundo.creado_en || '') - Date.parse(primero.creado_en || ''))
    : [];
  const cargarHistorialTrabajosRepartidor = useCallback(async (cursor: string | null = null, anexar = false) => {
    if (usuario?.rol !== 'repartidor') return;
    setCargandoHistorialRepartidor(true);
    setErrorHistorialRepartidor('');
    if (!anexar) setHistorialRepartidorExpandido(false);

    try {
      const parametros = new URLSearchParams();
      if (cursor) parametros.set('cursor', cursor);
      const respuesta = await authenticatedFetch(`${API_URL}/api/pedidos/historial/repartidor?${parametros}`);
      if (!respuesta.ok) throw new Error(await mensajeErrorApi(respuesta, 'No se pudo cargar el historial.'));
      const data = await respuesta.json() as {
        pedidos: PedidoHistorialRepartidor[];
        nextCursor: string | null;
      };
      if (!Array.isArray(data.pedidos) || (data.nextCursor !== null && typeof data.nextCursor !== 'string')) {
        throw new Error('La respuesta del historial no es válida.');
      }
      setHistorialTrabajosRepartidor(actual => anexar ? [...actual, ...data.pedidos] : data.pedidos);
      setCursorHistorialRepartidor(data.nextCursor);
    } catch (error) {
      console.error('No se pudo cargar el historial de trabajos:', error);
      setErrorHistorialRepartidor(error instanceof Error ? error.message : 'No se pudo cargar el historial.');
    } finally {
      setCargandoHistorialRepartidor(false);
    }
  }, [usuario?.rol]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (usuario?.rol === 'repartidor') void cargarHistorialTrabajosRepartidor();
  }, [cargarHistorialTrabajosRepartidor, usuario?.id, usuario?.rol]);

  const postulacionesPendientesRepartidor = usuario?.rol === 'repartidor'
    ? postulacionesReales.filter(p => p.repartidor_id === usuario.id && p.estado === 'pendiente')
    : [];
  const pedidosCompletadosKey = pedidosReales
    .filter(pedido => pedido.estado === 'completado')
    .map(pedido => pedido.id)
    .join(',');

  useEffect(() => {
    if (!usuario) {
      // oxlint-disable-next-line react/set-state-in-effect
      setResumenCalificaciones(null);
      setCalificacionesExpandidas(false);
      return;
    }
    let descartado = false;
    void authenticatedFetch(`${API_URL}/api/reviews/summary`)
      .then(async response => {
        if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudieron cargar las calificaciones'));
        return response.json() as Promise<ResumenCalificaciones>;
      })
      .then(resumen => {
        if (!descartado) {
          setResumenCalificaciones(resumen);
          setCalificacionesExpandidas(false);
        }
      })
      .catch(error => {
        if (!descartado) console.error('No se pudo cargar el resumen de calificaciones:', error);
      });
    return () => { descartado = true; };
  }, [usuario, pedidosCompletadosKey]);

  useEffect(() => {
    if (usuario?.rol !== 'repartidor') return;
    const claveAvisos = `llevalo_driver_notifications_${usuario.id}`;
    const preferenciaAvisos = localStorage.getItem(claveAvisos);
    Promise.resolve().then(() => {
      setRepartidorOnline(localStorage.getItem(`llevalo_driver_online_${usuario.id}`) === 'true');
    });
    void getDriverNotificationPermission()
      .then(async permission => {
        setPermisoAvisosRepartidor(permission);
        if (permission === 'granted' && preferenciaAvisos === null) {
          const permisoPreparado = await requestDriverNotificationPermission();
          setPermisoAvisosRepartidor(permisoPreparado);
          const activados = permisoPreparado === 'granted';
          localStorage.setItem(claveAvisos, String(activados));
          setAvisosRepartidorActivos(activados);
          return;
        }
        setAvisosRepartidorActivos(permission === 'granted' && preferenciaAvisos === 'true');
      })
      .catch(error => {
        console.error('No se pudo preparar el permiso de notificaciones:', error);
        setPermisoAvisosRepartidor('unsupported');
        setAvisosRepartidorActivos(false);
      });
  }, [usuario?.id, usuario?.rol]);

  useEffect(() => {
    if (usuario?.rol !== 'repartidor') return;
    void actualizarDisponibilidadPush(disponiblePushRepartidor)
      .catch(error => console.error('No se pudo sincronizar el estado disponible del repartidor:', error));
  }, [disponiblePushRepartidor, usuario?.id, usuario?.rol]);

  const cambiarAvisosRepartidor = async () => {
    if (!usuario || usuario.rol !== 'repartidor') return;
    if (avisosRepartidorActivos) {
      localStorage.setItem(`llevalo_driver_notifications_${usuario.id}`, 'false');
      const token = localStorage.getItem(`llevalo_push_token_${usuario.id}`);
      if (token) {
        try {
          if (usuario.es_admin) {
            await guardarTokenPush(token, Capacitor.isNativePlatform() ? 'android' : 'web', false);
          } else {
            await retirarTokenPush(token);
            localStorage.removeItem(`llevalo_push_token_${usuario.id}`);
          }
        } catch (error) {
          localStorage.setItem(`llevalo_driver_notifications_${usuario.id}`, 'true');
          console.error('No se pudo retirar el token push del dispositivo:', error);
          alert(error instanceof Error ? error.message : 'No se pudo desactivar este dispositivo.');
          return;
        }
      }
      setAvisosRepartidorActivos(false);
      return;
    }

    try {
      const permission = await requestDriverNotificationPermission();
      setPermisoAvisosRepartidor(permission);
      if (permission !== 'granted') {
        alert(permission === 'unsupported'
          ? 'Este navegador no permite notificaciones accionables. Usa la app de Android o un navegador compatible.'
          : permission === 'denied'
            ? 'El permiso está bloqueado. Habilita las notificaciones de Llévalo en los ajustes del dispositivo o navegador.'
            : 'No se concedió el permiso de notificaciones.');
        return;
      }
      localStorage.setItem(`llevalo_driver_notifications_${usuario.id}`, 'true');
      setAvisosRepartidorActivos(true);
    } catch (error) {
      console.error('No se pudieron activar las notificaciones:', error);
      alert('No se pudieron activar las notificaciones. Inténtalo nuevamente.');
    }
  };

  useEffect(() => {
    if (usuario?.rol !== 'repartidor' || pedidosCargadosUsuarioId !== usuario.id) return;

    const solicitudesActivas = pedidosReales.filter(
      pedido => pedido.estado === 'pendiente' || pedido.estado === 'postulado'
    );
    const idsSolicitudes = new Set(solicitudesActivas.map(pedido => pedido.id));
    const estadosPostulaciones = new Map(
      postulacionesReales
        .filter(postulacion => postulacion.repartidor_id === usuario.id)
        .map(postulacion => [postulacion.pedido_id, postulacion.estado])
    );
    let snapshot = snapshotAvisosRepartidorRef.current;
    const snapshotInicializado = snapshot?.userId === usuario.id;
    if (!snapshotInicializado) {
      snapshot = {
        userId: usuario.id,
        requestIds: idsSolicitudes,
        applications: estadosPostulaciones,
        notifiedIds: new Set<number>()
      };
      snapshotAvisosRepartidorRef.current = snapshot;
    }
    if (!snapshot) return;

    const solicitudesPorAvisar = solicitudesActivas.filter(pedido => {
      if (pedido.estado !== 'pendiente' || snapshot.notifiedIds.has(pedido.id) || !pedido.publicado_en) return false;
      const publicadoEn = Date.parse(pedido.publicado_en);
      return Number.isFinite(publicadoEn) && publicadoEn + 60_000 > horaActual;
    });
    const cambiosPostulacion = snapshotInicializado ? postulacionesReales.filter(postulacion => {
      if (postulacion.repartidor_id !== usuario.id) return false;
      const estadoAnterior = snapshot.applications.get(postulacion.pedido_id);
      return estadoAnterior === 'pendiente' && postulacion.estado !== 'pendiente';
    }) : [];

    snapshot.requestIds = idsSolicitudes;
    snapshot.applications = estadosPostulaciones;

    if (!avisosRepartidorActivos || !disponiblePushRepartidor || permisoAvisosRepartidor !== 'granted') return;

    for (const pedido of solicitudesPorAvisar) {
      if (Capacitor.isNativePlatform()
        && localStorage.getItem(`llevalo_push_token_${usuario.id}`)) {
        snapshot.notifiedIds.add(pedido.id);
        continue;
      }
      const publicadoEn = pedido.publicado_en ? Date.parse(pedido.publicado_en) : Number.NaN;
      const secondsRemaining = Number.isFinite(publicadoEn)
        ? Math.max(0, Math.ceil((publicadoEn + 60_000 - horaActual) / 1000))
        : 60;
      const notice: DriverOrderNotice = {
        id: pedido.id,
        serviceType: etiquetaTipoServicio(pedido.tipo_servicio),
        secondsRemaining
      };
      snapshot.notifiedIds.add(pedido.id);
      void showDriverOrderNotification(notice).catch(error => {
        snapshot.notifiedIds.delete(pedido.id);
        console.error('No se pudo mostrar la notificación de un nuevo trabajo:', error);
      });
    }

    for (const postulacion of cambiosPostulacion) {
      if (Capacitor.isNativePlatform()
        && localStorage.getItem(`llevalo_push_token_${usuario.id}`)) continue;
      const aceptada = postulacion.estado === 'aceptado';
      void showDriverUpdateNotification(
        aceptada ? '¡Te eligieron para el trabajo!' : 'El cliente eligió a otro repartidor',
        aceptada
          ? 'Abre Llévalo para revisar los datos del servicio y comenzar.'
          : 'La solicitud ya fue asignada. Puedes seguir atento a nuevas oportunidades.',
        postulacion.pedido_id
      ).catch(error => console.error('No se pudo mostrar la actualización de la postulación:', error));
    }
  }, [
    avisosRepartidorActivos,
    horaActual,
    disponiblePushRepartidor,
    pedidosCargadosUsuarioId,
    pedidosReales,
    permisoAvisosRepartidor,
    postulacionesReales,
    usuario
  ]);

  useEffect(() => {
    if (usuario?.rol !== 'repartidor' || pedidosCargadosUsuarioId !== usuario.id) return;
    const snapshot = snapshotAvisosRepartidorRef.current;
    if (!snapshot || snapshot.userId !== usuario.id) return;

    const solicitudesPendientes = pedidosReales.filter(pedido => pedido.estado === 'pendiente');
    const idsPendientes = new Set(solicitudesPendientes.map(pedido => pedido.id));
    for (const pedidoId of snapshot.notifiedIds) {
      if (!idsPendientes.has(pedidoId)) {
        void clearDriverOrderNotification(pedidoId).catch(error => {
          console.error('No se pudo retirar una notificación de trabajo:', error);
        });
        snapshot.notifiedIds.delete(pedidoId);
        ultimoBloqueTemporizadorRef.current.delete(pedidoId);
      }
    }

    if (!avisosRepartidorActivos || !disponiblePushRepartidor || permisoAvisosRepartidor !== 'granted') {
      for (const pedidoId of snapshot.notifiedIds) {
        void clearDriverOrderNotification(pedidoId).catch(error => {
          console.error('No se pudo silenciar una notificación de trabajo:', error);
        });
      }
      snapshot.notifiedIds.clear();
      ultimoBloqueTemporizadorRef.current.clear();
      return;
    }
    for (const pedido of solicitudesPendientes) {
      if (!snapshot.notifiedIds.has(pedido.id) || !pedido.publicado_en) continue;
      const publicadoEn = Date.parse(pedido.publicado_en);
      if (!Number.isFinite(publicadoEn)) continue;
      const secondsRemaining = Math.max(0, Math.ceil((publicadoEn + 60_000 - horaActual) / 1000));
      if (secondsRemaining === 0) {
        void clearDriverOrderNotification(pedido.id).catch(error => {
          console.error('No se pudo retirar una notificación vencida:', error);
        });
        snapshot.notifiedIds.delete(pedido.id);
        ultimoBloqueTemporizadorRef.current.delete(pedido.id);
        continue;
      }

      const bucket = Math.ceil(secondsRemaining / 10);
      const previousBucket = ultimoBloqueTemporizadorRef.current.get(pedido.id);
      if (previousBucket === undefined) {
        ultimoBloqueTemporizadorRef.current.set(pedido.id, bucket);
      } else if (bucket !== previousBucket) {
        ultimoBloqueTemporizadorRef.current.set(pedido.id, bucket);
        const notice: DriverOrderNotice = {
          id: pedido.id,
          serviceType: etiquetaTipoServicio(pedido.tipo_servicio),
          secondsRemaining
        };
        void showDriverOrderNotification(notice, true).catch(error => {
          console.error('No se pudo actualizar la cuenta regresiva de la notificación:', error);
        });
      }
    }
  }, [
    avisosRepartidorActivos,
    horaActual,
    disponiblePushRepartidor,
    pedidosCargadosUsuarioId,
    pedidosReales,
    permisoAvisosRepartidor,
    usuario
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('notificationAction');
    if (!action) return;
    if (!usuario) {
      // oxlint-disable-next-line react/set-state-in-effect
      setActiveTab('auth');
      return;
    }

    const orderIdValue = Number(params.get('orderId'));
    const orderId = Number.isSafeInteger(orderIdValue) && orderIdValue > 0 ? orderIdValue : null;
    params.delete('notificationAction');
    params.delete('orderId');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    );
    if (action === 'admin-payment') {
      manejarAccionPagoAdminRef.current(orderId);
    } else {
      void manejarAccionAvisoRef.current(action, orderId);
    }
  }, [usuario]);

  useEffect(() => {
    if (activeTab !== 'admin' || seccionAdmin !== 'pagos' || pagoNotificadoId === null
      || cargandoAdmin || !pagosPendientesAdmin.some(pago => pago.id === pagoNotificadoId)) return;
    document.getElementById(`admin-pago-${pagoNotificadoId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }, [activeTab, cargandoAdmin, pagoNotificadoId, pagosPendientesAdmin, seccionAdmin]);

  const mensajeNavegacion = (() => {
    if (usuario?.rol !== 'repartidor' || !pedidoAsignadoRepartidor || !coordsUsuarioGPS) return '';
    const etapa = pedidoAsignadoRepartidor.estado;
    const destino = etapa === 'aceptado'
      ? { lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon }
      : { lat: pedidoAsignadoRepartidor.destino_lat, lng: pedidoAsignadoRepartidor.destino_lon };
    if (medirDistanciaMetros(coordsUsuarioGPS, destino) > 30) return '';
    if (etapa === 'aceptado') {
      return pedidoAsignadoRepartidor.metodo_pago === 'efectivo' && pedidoAsignadoRepartidor.estado_pago !== 'pagado'
        ? 'Llegaste al punto A. Confirma manualmente el efectivo recibido para iniciar el servicio.'
        : 'Llegaste al punto A. La ruta continúa automáticamente al punto B.';
    }
    return 'Llegaste al punto B. Confirma manualmente la entrega para finalizar.';
  })();
  const pagoPedidoCompleto = Boolean(configuracionPago?.pagoMovil.banco
    && configuracionPago.pagoMovil.telefono
    && configuracionPago.pagoMovil.cedula
    && configuracionPago.pagoMovil.titular)
    && /^\d{1,100}$/.test(referenciaPago.trim());

  useEffect(() => {
    if (usuario?.rol !== 'repartidor' || !pedidoAsignadoRepartidor || !coordsUsuarioGPS) {
      llegadaProcesadaRef.current = null;
      return;
    }

    const etapa = pedidoAsignadoRepartidor.estado;
    const destino = etapa === 'aceptado'
      ? { lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon }
      : { lat: pedidoAsignadoRepartidor.destino_lat, lng: pedidoAsignadoRepartidor.destino_lon };
    const distanciaMetros = medirDistanciaMetros(coordsUsuarioGPS, destino);
    const claveLlegada = `${pedidoAsignadoRepartidor.id}:${etapa}`;

    if (distanciaMetros > 50) {
      if (llegadaProcesadaRef.current === claveLlegada) llegadaProcesadaRef.current = null;
      return;
    }
    if (distanciaMetros > 30 || llegadaProcesadaRef.current === claveLlegada) return;

    llegadaProcesadaRef.current = claveLlegada;
    if (etapa === 'aceptado'
      && !(pedidoAsignadoRepartidor.metodo_pago === 'efectivo' && pedidoAsignadoRepartidor.estado_pago !== 'pagado')) {
      // The state change is server-driven; the normal polling updates the UI after the response.
      // oxlint-disable-next-line react/set-state-in-effect
      void cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'entregado_repartidor');
    }
  }, [cambiarEstadoPedido, coordsUsuarioGPS, pedidoAsignadoRepartidor, usuario?.rol]);

  const cambiarEstadoRepartidor = async () => {
    if (!usuario || usuario.rol !== 'repartidor' || cambiandoEstadoRepartidor) return;
    if (!repartidorOnline) {
      if (!coordsUsuarioGPS) {
        setErrorUbicacion('Activa la ubicación para conectarte y recibir trabajos.');
        obtenerUbicacionActual();
        return;
      }
      setCambiandoEstadoRepartidor(true);
      try {
        await actualizarDisponibilidadPush(true);
        localStorage.setItem(`llevalo_driver_online_${usuario.id}`, 'true');
        setRepartidorOnline(true);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'No se pudo activar tu disponibilidad.');
      } finally {
        setCambiandoEstadoRepartidor(false);
      }
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
      await actualizarDisponibilidadPush(false);
      localStorage.setItem(`llevalo_driver_online_${usuario.id}`, 'false');
      setRepartidorOnline(false);
      void clearAllDriverNotifications()
        .catch(error => console.error('No se pudieron retirar todas las notificaciones al desconectarte:', error));
    } catch (error) {
      await sincronizarDatos();
      alert(error instanceof Error ? error.message : 'No se pudo desconectar al repartidor.');
    } finally {
      setCambiandoEstadoRepartidor(false);
    }
  };

  const salirDelRadar = async () => {
    if (!usuario || usuario.rol !== 'repartidor') return;
    try {
      await actualizarDisponibilidadPush(false);
      localStorage.setItem(`llevalo_driver_online_${usuario.id}`, 'false');
      setRepartidorOnline(false);
      void clearAllDriverNotifications()
        .catch(error => console.error('No se pudieron retirar las notificaciones al salir del radar:', error));
    } catch (error) {
      console.error('No se pudo desactivar la disponibilidad antes de salir:', error);
      alert('No se pudo confirmar la desconexión. Comprueba tu conexión e inténtalo de nuevo.');
      return;
    }

    if (Capacitor.isNativePlatform()) void CapacitorApp.exitApp();
    else setActiveTab('home');
  };

  const abrirPerfilPublico = async (pedidoId: number, profileId: number) => {
    setPerfilPublico(null);
    setErrorPerfilPublico('');
    setPerfilPublicoCargando(true);
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/reviews/profile/${profileId}?pedidoId=${pedidoId}`
      );
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo abrir el perfil'));
      const result = await response.json() as { perfil: PerfilPublico };
      setPerfilPublico(result.perfil);
    } catch (error) {
      setErrorPerfilPublico(error instanceof Error ? error.message : 'No se pudo abrir el perfil.');
    } finally {
      setPerfilPublicoCargando(false);
    }
  };

  const calificarPedido = async (pedidoId: number) => {
    const estrellas = estrellasSeleccionadas[pedidoId];
    if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return;
    setCalificandoPedidoId(pedidoId);
    try {
      const response = await authenticatedFetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId, estrellas })
      });
      if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudo enviar la calificación'));
      setResumenCalificaciones(current => current
        ? {
          ...current,
          pedidos: current.pedidos.map(pedido => pedido.pedido_id === pedidoId
            ? { ...pedido, mis_estrellas: estrellas }
            : pedido)
        }
        : current);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo enviar la calificación.');
    } finally {
      setCalificandoPedidoId(null);
    }
  };

  const alternarHistorialCalificaciones = async () => {
    if (calificacionesExpandidas) {
      setCalificacionesExpandidas(false);
      return;
    }

    if (!resumenCalificaciones) return;
    if (resumenCalificaciones.pedidos.length >= resumenCalificaciones.total_pedidos) {
      setCalificacionesExpandidas(true);
      return;
    }

    setCargandoHistorialCalificaciones(true);
    try {
      const response = await authenticatedFetch(`${API_URL}/api/reviews/summary?all=true`);
      if (!response.ok) {
        throw new Error(await mensajeErrorApi(response, 'No se pudieron cargar todas las calificaciones'));
      }
      const resumen = await response.json() as ResumenCalificaciones;
      if (resumen.pedidos.length < resumen.total_pedidos) {
        throw new Error('No se pudo cargar el historial completo de calificaciones.');
      }
      setResumenCalificaciones(resumen);
      setCalificacionesExpandidas(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo cargar el historial completo.');
    } finally {
      setCargandoHistorialCalificaciones(false);
    }
  };

  useEffect(() => {
    if (!usuario
      || (usuario.rol === 'cliente' && activeTab !== 'cliente')
      || (usuario.rol === 'repartidor' && !pedidoAsignadoRepartidorId && activeTab !== 'repartidor')) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const location = { lat: coords.latitude, lng: coords.longitude };
        coordsUsuarioGPSRef.current = location;
        setCoordsUsuarioGPS(location);
        setErrorUbicacion('');
        setUbicacionCargando(false);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED || document.visibilityState === 'visible') {
          coordsUsuarioGPSRef.current = null;
          setCoordsUsuarioGPS(null);
        }
        setErrorUbicacion(error.code === error.PERMISSION_DENIED
          ? 'Activa el permiso de ubicación para usar Llévalo.'
          : 'No se pudo actualizar tu ubicación. Comprueba que el GPS esté activo.');
        setUbicacionCargando(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeTab, usuario, pedidoAsignadoRepartidorId]);

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
    <div className={`app-shell flex flex-col font-sans transition-colors duration-300 ${usuario ? 'app-shell-authenticated' : ''} ${pasoSolicitud ? 'solicitud-open' : ''} ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#FDFBF7] text-slate-800'}`}>
      <header className={`app-header border-b backdrop-blur sticky top-0 z-50 px-4 md:px-10 py-3 flex flex-wrap justify-between items-center gap-y-2 shadow-sm transition-colors ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-[#FDFBF7]/90 border-orange-100'}`}>
        {usuario ? (
          <div className="flex items-center space-x-3" aria-label="Llévalo">
            <div className="brand-mark" aria-hidden="true"><span>L</span></div>
            <span className={`text-xl md:text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Llévalo</span>
          </div>
        ) : (
          <button type="button" onClick={() => navegarA('home')} className="flex items-center space-x-3" aria-label="Volver al inicio">
            <div className="brand-mark" aria-hidden="true"><span>L</span></div>
            <span className={`text-xl md:text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Llévalo</span>
          </button>
        )}
        
        <nav className={`hidden md:flex space-x-2 p-1.5 rounded-2xl border ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-orange-50/80 border-orange-100'}`}>
          {usuario?.rol === 'cliente' && <button onClick={irAPedidos} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'cliente' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Pedir</button>}
          {usuario?.rol === 'repartidor' && <button onClick={() => navegarA('repartidor')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'repartidor' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Radar</button>}
          <button onClick={() => navegarA('home')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'home' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Inicio</button>
          {usuario && <button onClick={() => navegarA('perfil')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'perfil' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Perfil</button>}
        </nav>

        <div className="flex items-center space-x-2 md:space-x-3">
          {usuario ? (
            <>
              {tasasCambio && (
                <span title="Equivalente del dólar según la tasa BCV" className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold leading-tight sm:px-4 sm:text-sm ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-orange-100 bg-white text-slate-700'}`}>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">Dólar BCV</span>
                  <span className="whitespace-nowrap text-sm font-black sm:text-base">{formatoMoneda(tasasCambio.bolivaresPorDolar)}</span>
                </span>
              )}
              <button type="button" onClick={() => navegarA('perfil')} aria-label="Abrir mi perfil" className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 shadow-sm transition hover:scale-105 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-white bg-orange-100'}`}>
                {usuario.foto
                  ? <img src={usuario.foto} alt="" className="h-full w-full object-cover" />
                  : <span className="text-sm font-black text-[#FF5722]">{usuario.nombre.slice(0, 1).toUpperCase()}</span>}
              </button>
            </>
          ) : (
            <button onClick={() => { setErrorAuth(''); setAuthMode('choice'); navegarA('auth'); }} className={`flex items-center space-x-1.5 border px-4 py-2 rounded-2xl transition text-xs md:text-sm font-bold shadow-sm cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800' : 'bg-white hover:bg-orange-50 border-orange-200 text-slate-800'}`}>
              <User size={16} className="text-[#FF5722]" />
              <span>Ingresar</span>
            </button>
          )}
        </div>

      </header>

      {usuario && (
        <nav aria-label="Navegación móvil" className={`mobile-nav flex w-full flex-wrap items-center gap-2 md:hidden ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
            {usuario.rol === 'cliente' ? (
              <button type="button" aria-pressed={activeTab === 'cliente'} onClick={irAPedidos} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'cliente' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <Package size={17} /> Pedir
              </button>
            ) : (
              <button type="button" aria-pressed={activeTab === 'repartidor'} onClick={() => navegarA('repartidor')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'repartidor' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <Bike size={17} /> Radar
              </button>
            )}
            <button type="button" aria-pressed={activeTab === 'home'} onClick={() => navegarA('home')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'home' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
              <MapPin size={17} /> Inicio
            </button>
            <button type="button" aria-pressed={activeTab === 'perfil'} onClick={() => navegarA('perfil')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'perfil' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
              <User size={17} /> Perfil
              </button>
        </nav>
      )}

      <input
        ref={inputAdjuntoChatRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={event => {
          const archivo = event.target.files?.[0];
          const pedidoId = pedidoChatAdjuntoRef.current;
          if (archivo && pedidoId) void enviarAdjuntoChat(pedidoId, archivo, 'imagen', archivo.name);
          event.target.value = '';
        }}
      />

      <main className={`app-page flex-1 flex flex-col p-4 md:p-6 max-w-7xl mx-auto w-full ${usuario ? 'app-page-authenticated' : ''}`}>
        {activeTab === 'home' && !usuario && (
          <>
            <div className="landing-hero grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-8 lg:py-14">
              <div className="landing-copy space-y-6">
                <div className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase border ${darkMode ? 'bg-orange-950/60 border-orange-900 text-orange-300' : 'bg-orange-100 border-orange-200 text-[#FF5722]'}`}>
                  <MapPin size={14} className="text-[#FF5722]" />
                  <span>Carabobo, Venezuela 🇻🇪</span>
                </div>
                <h1 className={`text-4xl lg:text-7xl font-black tracking-tight leading-[1.08] ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Lo que necesites, <span className="text-[#FF5722]">Llévalo ya.</span>
                </h1>
                <p className={`text-base lg:text-lg leading-relaxed max-w-xl ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Comida, compras, encomiendas o viajes por Carabobo. Resuelve desde un solo lugar y sigue tu servicio desde el teléfono.
                </p>

                <div className="pt-2">
                  <button onClick={() => { setAuthMode('choice'); setAuthRoleSelection('cliente'); navegarA('auth'); }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF5722] px-8 py-4 font-bold text-white shadow-lg transition hover:bg-[#F4511E] cursor-pointer sm:w-fit">
                    <span>Empezar aquí</span>
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>

              <div className="landing-photo relative">
                <div className={`rounded-3xl overflow-hidden shadow-xl border p-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-orange-100 border-orange-200'}`}>
                  <img src="/hero-moto.jpg" alt="Repartidor de Llévalo en moto" className="rounded-2xl object-cover w-full h-[420px]" />
                </div>
              </div>
            </div>

            <section className="landing-content-section" aria-labelledby="landing-services-title">
              <div className="mb-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FF5722]">Una app para resolver</p>
                <h2 id="landing-services-title" className={`mt-1 text-2xl font-black tracking-tight md:text-3xl ${darkMode ? 'text-white' : 'text-slate-900'}`}>Lo que necesitas, en camino.</h2>
                <p className="mt-1 text-sm text-slate-500">Servicios locales sencillos, desde el teléfono.</p>
              </div>
              <div className="horizontal-story-carousel landing-carousel" role="region" aria-label="Servicios de Llévalo" aria-roledescription="carrusel" tabIndex={0}>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-orange-100 text-[#FF5722]"><Package size={22} /></span>
                  <span className="landing-info-kicker">Encomiendas</span>
                  <h3>Paquetes de hasta 15 kg</h3>
                  <p>Envía documentos, compras o ese paquete que necesitas hacer llegar.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-emerald-100 text-emerald-700"><ShoppingBag size={22} /></span>
                  <span className="landing-info-kicker">Compras</span>
                  <h3>Comida y mercado</h3>
                  <p>Pide lo que te hace falta y recíbelo sin salir de casa.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-amber-100 text-amber-700"><Clock size={22} /></span>
                  <span className="landing-info-kicker">Mandados</span>
                  <h3>Pequeñas vueltas, resueltas</h3>
                  <p>Coordina una entrega o un mandado cotidiano en pocos pasos.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-sky-100 text-sky-700"><CarFront size={22} /></span>
                  <span className="landing-info-kicker">Viajes</span>
                  <h3>Muévete por Carabobo</h3>
                  <p>Indica desde dónde sales y a dónde vas para solicitar tu traslado.</p>
                </article>
              </div>
            </section>

            <section className="landing-content-section" aria-labelledby="landing-benefits-title">
              <div className="mb-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600">Hecho para darte tranquilidad</p>
                <h2 id="landing-benefits-title" className={`mt-1 text-2xl font-black tracking-tight md:text-3xl ${darkMode ? 'text-white' : 'text-slate-900'}`}>Tú sabes qué está pasando.</h2>
              </div>
              <div className="horizontal-story-carousel landing-carousel" role="region" aria-label="Ventajas de Llévalo" aria-roledescription="carrusel" tabIndex={0}>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-emerald-100 text-emerald-700"><MapPin size={22} /></span>
                  <span className="landing-info-kicker">Seguimiento</span>
                  <h3>Tu servicio a la vista</h3>
                  <p>Consulta el estado y revisa el recorrido en el mapa.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-orange-100 text-[#FF5722]"><DollarSign size={22} /></span>
                  <span className="landing-info-kicker">Precio claro</span>
                  <h3>Conoce el costo antes</h3>
                  <p>Revisa distancia y total en dólares y bolívares antes de enviar.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-amber-100 text-amber-700"><CheckCircle2 size={22} /></span>
                  <span className="landing-info-kicker">Pago Móvil</span>
                  <h3>Verificación antes de publicar</h3>
                  <p>La referencia se revisa antes de ofrecer el servicio a repartidores.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-info-icon bg-violet-100 text-violet-700"><Users size={22} /></span>
                  <span className="landing-info-kicker">Comunicación</span>
                  <h3>Habla con tu repartidor</h3>
                  <p>Usa el chat privado para coordinar los detalles del servicio.</p>
                </article>
              </div>
            </section>

            <section className="landing-content-section" aria-labelledby="landing-steps-title">
              <div className="mb-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FF5722]">Sin complicaciones</p>
                <h2 id="landing-steps-title" className={`mt-1 text-2xl font-black tracking-tight md:text-3xl ${darkMode ? 'text-white' : 'text-slate-900'}`}>Pedir es así de fácil.</h2>
              </div>
              <div className="horizontal-story-carousel landing-carousel" role="region" aria-label="Cómo pedir con Llévalo" aria-roledescription="carrusel" tabIndex={0}>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-step-number">01</span>
                  <h3>Elige tu servicio</h3>
                  <p>Selecciona si necesitas un envío o un viaje.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-step-number">02</span>
                  <h3>Marca la ruta</h3>
                  <p>Indica origen y destino, y revisa distancia y precio.</p>
                </article>
                <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                  <span className="landing-step-number">03</span>
                  <h3>Confirma y sigue</h3>
                  <p>Envía tu referencia de Pago Móvil y mantente al tanto del servicio.</p>
                </article>
              </div>
            </section>
          </>
        )}

        {activeTab === 'home' && usuario && (
          <section className="w-full max-w-5xl mx-auto py-6 md:py-12 space-y-6">
            <div className={`dashboard-welcome rounded-3xl p-6 md:p-10 border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
              <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-center">
                <div className="space-y-3">
                  <h1 className={`text-3xl md:text-5xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    ¡Hola, {usuario.nombre.split(' ')[0]}!
                  </h1>
                  <p className={`text-sm md:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {usuario.rol === 'cliente'
                      ? '¿Qué necesitas hoy? Pide algo y nosotros lo llevamos.'
                      : 'Tu próximo trabajo está a un toque. Revisa el radar y mantente disponible.'}
                  </p>
                </div>
                {usuario.rol === 'repartidor' && (
                  <button onClick={() => navegarA('repartidor')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF5722] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#F4511E]">
                    <Bike size={17} /> Abrir radar
                  </button>
                )}
              </div>
            </div>

            {usuario.rol === 'cliente' ? (
              <div className="dashboard-service-carousel mobile-service-carousel grid gap-4 md:grid-cols-2" role="region" aria-label="Accesos rápidos del cliente" aria-roledescription="carrusel" tabIndex={0}>
                <button onClick={() => { setServiceType('envios'); irAPedidos(); }} className={`dashboard-action-card flex flex-col items-center rounded-3xl border p-6 text-center transition hover:-translate-y-0.5 ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-orange-700' : 'bg-white border-orange-100 hover:border-orange-300'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-[#FF5722]"><Package size={20} /></div>
                  <h2 className="font-black">Pedir un envío</h2>
                  <p className="mt-2 text-xs text-slate-500">Comida, mercado, mandados y más.</p>
                  <span className="mt-4 inline-flex items-center justify-center gap-1 text-xs font-bold text-[#FF5722]">Continuar <ArrowRight size={14} /></span>
                </button>
                <button onClick={() => { setServiceType('viajes'); irAPedidos(); }} className={`dashboard-action-card flex flex-col items-center rounded-3xl border p-6 text-center transition hover:-translate-y-0.5 ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-orange-700' : 'bg-white border-orange-100 hover:border-orange-300'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CarFront size={20} /></div>
                  <h2 className="font-black">Pedir un viaje</h2>
                  <p className="mt-2 text-xs text-slate-500">Indica tu origen y destino para ver el costo.</p>
                  <span className="mt-4 inline-flex items-center justify-center gap-1 text-xs font-bold text-[#FF5722]">Continuar <ArrowRight size={14} /></span>
                </button>
              </div>
            ) : (
              <div className="dashboard-service-carousel mobile-service-carousel grid gap-4 md:grid-cols-3" role="region" aria-label="Accesos rápidos del repartidor" aria-roledescription="carrusel" tabIndex={0}>
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
                  <p className="mt-2 text-xs text-slate-500">{disponiblePushRepartidor ? 'Estás conectado y puedes recibir pedidos.' : 'Activa la ubicación y conéctate desde el radar para recibir solicitudes.'}</p>
                  <button onClick={() => navegarA('repartidor')} className="mt-4 text-xs font-bold text-[#FF5722] hover:underline">Ir al radar de trabajos</button>
                </div>
                <button type="button" onClick={() => navegarA('perfil')} className={`rounded-3xl border p-6 text-left transition hover:-translate-y-0.5 ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-orange-700' : 'bg-white border-orange-100 hover:border-orange-300'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-[#FF5722]"><User size={20} /></div>
                  <h2 className="font-black">Tu perfil</h2>
                  <p className="mt-2 text-xs text-slate-500">Revisa tus datos, vehículo y disponibilidad.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#FF5722]">Abrir perfil <ArrowRight size={14} /></span>
                </button>
              </div>
            )}

            <div className="horizontal-story-carousel dashboard-feature-carousel" role="region" aria-label="Ventajas de tu cuenta" aria-roledescription="carrusel" tabIndex={0}>
              {usuario.rol === 'cliente' ? (
                <>
                  <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    <span className="landing-info-icon bg-orange-100 text-[#FF5722]"><Package size={20} /></span>
                    <h3>Envíos y viajes</h3>
                    <p>Comida, mercado, mandados o traslados en un solo lugar.</p>
                  </article>
                  <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    <span className="landing-info-icon bg-emerald-100 text-emerald-700"><MapPin size={20} /></span>
                    <h3>Seguimiento claro</h3>
                    <p>Revisa el estado de tu solicitud y el recorrido del repartidor.</p>
                  </article>
                  <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    <span className="landing-info-icon bg-amber-100 text-amber-700"><DollarSign size={20} /></span>
                    <h3>Pagos transparentes</h3>
                    <p>Consulta el monto y el estado de pago de cada solicitud.</p>
                  </article>
                </>
              ) : (
                <>
                  <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    <span className="landing-info-icon bg-orange-100 text-[#FF5722]"><Package size={20} /></span>
                    <h3>Trabajos cerca</h3>
                    <p>Explora solicitudes disponibles y elige las que te convengan.</p>
                  </article>
                  <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    <span className="landing-info-icon bg-emerald-100 text-emerald-700"><MapPin size={20} /></span>
                    <h3>Ruta guiada</h3>
                    <p>Usa el mapa para llegar al origen y al destino del servicio.</p>
                  </article>
                  <article className={`landing-info-card ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    <span className="landing-info-icon bg-amber-100 text-amber-700"><Clock size={20} /></span>
                    <h3>Tu ritmo</h3>
                    <p>Controla tu disponibilidad y tus postulaciones desde el radar.</p>
                  </article>
                </>
              )}
            </div>
            {usuario.rol === 'cliente' && (
              <section className="space-y-4" aria-labelledby="service-history-title">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FF5722]">Actividad de tu cuenta</p>
                  <h2 id="service-history-title" className={`mt-1 text-xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Historial de servicios</h2>
                </div>
                {!pedidoActivoCliente && pedidoExpiradoReciente && (
                  <p role="status" className={`rounded-2xl border p-4 text-xs ${darkMode ? 'border-amber-900 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                    {pedidoExpiradoReciente.motivo_cancelacion === 'sin_repartidor'
                      ? 'Tu solicitud anterior se canceló porque ningún repartidor se postuló en 60 segundos.'
                      : 'El repartidor canceló la solicitud antes de iniciar el servicio.'}
                  </p>
                )}
                {pedidosHistorialCliente.length === 0 ? (
                  <p className={`rounded-3xl border p-5 text-sm text-slate-500 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    Tus servicios activos y completados aparecerán aquí.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pedidosHistorialCliente.map(pedido => {
                      const estaActivo = pedido.estado !== 'completado';
                      const etiquetaEstado = pedido.estado === 'completado'
                        ? 'Completado'
                        : pedido.estado === 'pendiente'
                          ? 'Esperando repartidor'
                          : pedido.estado === 'postulado'
                            ? 'Repartidor interesado'
                            : pedido.estado === 'entregado_repartidor'
                              ? 'En destino'
                              : 'En curso';
                      return (
                        <article key={pedido.id} className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${pedido.tipo_servicio === 'viajes' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-[#FF5722]'}`}>
                                {pedido.tipo_servicio === 'viajes' ? <CarFront size={19} /> : <Package size={19} />}
                              </span>
                              <div className="min-w-0">
                                <h3 className="text-sm font-black">{etiquetaTipoServicio(pedido.tipo_servicio)} · {codigoPedido(pedido.id)}</h3>
                                <p className="mt-1 break-words text-xs text-slate-500">{pedido.origen_texto} <ArrowRight size={12} className="mx-1 inline" /> {pedido.destino_texto}</p>
                                <p className="mt-1 text-[10px] text-slate-400">{pedido.creado_en ? new Date(pedido.creado_en).toLocaleString('es-VE') : ''}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                              <span className={`rounded-full px-3 py-1 text-[10px] font-black ${estaActivo ? 'bg-orange-100 text-[#D84315] dark:bg-orange-950/50 dark:text-orange-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>{etiquetaEstado}</span>
                              <span className="text-sm font-black">{mostrarMontoPedido(pedido.tarifa)}</span>
                            </div>
                          </div>
                          {estaActivo && <button type="button" onClick={irAPedidos} className="mt-3 rounded-2xl border border-orange-200 px-4 py-2 text-xs font-bold text-[#FF5722] transition hover:bg-orange-50 dark:border-orange-900 dark:hover:bg-orange-950/30">Ver servicio activo</button>}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {usuario.rol === 'repartidor' && (
              <section className="space-y-3" aria-labelledby="driver-work-history-title">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FF5722]">Actividad de tu cuenta</p>
                    <h2 id="driver-work-history-title" className={`mt-1 text-xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Trabajos realizados</h2>
                  </div>
                </div>
                {cargandoHistorialRepartidor && historialTrabajosRepartidor.length === 0 && (
                  <p role="status" className="rounded-3xl border border-orange-100 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                    Cargando historial…
                  </p>
                )}
                {errorHistorialRepartidor && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <span>{errorHistorialRepartidor}</span>
                    <button type="button" onClick={() => void cargarHistorialTrabajosRepartidor(cursorHistorialRepartidor, historialTrabajosRepartidor.length > 0)} className="font-bold underline">
                      Reintentar
                    </button>
                  </div>
                )}
                {!cargandoHistorialRepartidor && !errorHistorialRepartidor && historialTrabajosRepartidor.length === 0 && (
                  <p className={`rounded-3xl border p-5 text-sm text-slate-500 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    Tus trabajos completados aparecerán aquí.
                  </p>
                )}
                {historialTrabajosRepartidor.length > 0 && (
                  <div className="space-y-3">
                    {(historialRepartidorExpandido ? historialTrabajosRepartidor : historialTrabajosRepartidor.slice(0, 3)).map(pedido => (
                      <article key={pedido.id} className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${pedido.tipo_servicio === 'viajes' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-[#FF5722]'}`}>
                              {pedido.tipo_servicio === 'viajes' ? <CarFront size={19} /> : <Package size={19} />}
                            </span>
                            <div className="min-w-0">
                              <h3 className="text-sm font-black">{etiquetaTipoServicio(pedido.tipo_servicio)} · {codigoPedido(pedido.id)}</h3>
                              <p className="mt-1 break-words text-xs text-slate-500">{pedido.origen_texto} <ArrowRight size={12} className="mx-1 inline" /> {pedido.destino_texto}</p>
                              <p className="mt-1 text-[10px] text-slate-400">{new Date(pedido.completado_en).toLocaleString('es-VE')}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Completado</span>
                            <span className="text-sm font-black">{mostrarMontoPedido(pedido.tarifa)}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                    <div className="flex flex-wrap justify-center gap-2">
                      {!historialRepartidorExpandido && historialTrabajosRepartidor.length > 3 && (
                        <button type="button" onClick={() => setHistorialRepartidorExpandido(true)} className={`rounded-xl border px-4 py-2 text-xs font-bold ${darkMode ? 'border-slate-700 text-slate-200' : 'border-orange-200 text-[#D84315]'}`}>
                          Ver historial
                        </button>
                      )}
                      {historialRepartidorExpandido && cursorHistorialRepartidor && (
                        <button type="button" disabled={cargandoHistorialRepartidor} onClick={() => void cargarHistorialTrabajosRepartidor(cursorHistorialRepartidor, true)} className="rounded-xl bg-[#FF5722] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                          {cargandoHistorialRepartidor ? 'Cargando…' : 'Cargar más trabajos'}
                        </button>
                      )}
                      {historialRepartidorExpandido && historialTrabajosRepartidor.length > 3 && (
                        <button type="button" onClick={() => setHistorialRepartidorExpandido(false)} className={`rounded-xl border px-4 py-2 text-xs font-bold ${darkMode ? 'border-slate-700 text-slate-200' : 'border-orange-200 text-[#D84315]'}`}>
                          Ver menos
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
            {pedidosChatCompletados.length > 0 && (
              <section className="space-y-3" aria-labelledby="recent-chat-title">
                <div>
                  <h2 id="recent-chat-title" className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Conversaciones recientes</h2>
                  <p className="mt-1 text-xs text-slate-500">Los chats finalizados quedan disponibles durante 7 días.</p>
                </div>
                {pedidosChatCompletados.map(pedido => (
                  <details key={pedido.id} className={`rounded-2xl border p-3 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                    <summary className="cursor-pointer text-xs font-bold">
                      {etiquetaTipoServicio(pedido.tipo_servicio)} · {usuario.rol === 'cliente' ? pedido.repartidor_nombre || 'Repartidor' : pedido.cliente_nombre}
                      <span className="ml-2 text-[10px] font-medium text-slate-500">{pedido.completado_en ? new Date(pedido.completado_en).toLocaleString('es-VE') : ''}</span>
                    </summary>
                    <div className="mt-3">{renderChatPedido(pedido)}</div>
                  </details>
                ))}
              </section>
            )}
          </section>
        )}

        {activeTab === 'auth' && (
          <div className="max-w-md mx-auto w-full py-8">
            <div className={`border p-6 md:p-8 rounded-3xl shadow-sm space-y-6 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
              <button
                type="button"
                onClick={() => {
                  if (authMode === 'choice') navegarA('home');
                  else {
                    if (authMode === 'action') {
                      setAccionCorreo(null);
                      setPassword('');
                      setConfirmarPassword('');
                    }
                    setAuthMode('choice');
                    setErrorAuth('');
                    setMensajeAuth('');
                  }
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-orange-50'}`}
              >
                <ArrowLeft size={15} /> {authMode === 'choice' ? 'Volver al inicio' : 'Volver a opciones'}
              </button>
              <div className="text-center space-y-1">
                <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {authMode === 'choice'
                    ? 'Bienvenido a Llévalo'
                    : authMode === 'login'
                      ? '¡Bienvenido de nuevo!'
                      : authMode === 'register'
                        ? authRoleSelection === 'repartidor' ? 'Postúlate como repartidor' : 'Crea tu cuenta'
                        : authMode === 'pending'
                          ? 'Revisa tu correo'
                          : accionCorreo?.tipo === 'activar-repartidor' ? 'Activa tu cuenta' : 'Confirma tu correo'}
                </h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {authMode === 'choice'
                    ? 'Elige cómo quieres continuar'
                    : authMode === 'pending'
                      ? registroPendiente?.etapa === 'revision' ? 'Tu postulación fue recibida para revisión presencial' : 'Necesitamos confirmar tu dirección de correo'
                      : authMode === 'action'
                        ? 'Este enlace es personal y de un solo uso'
                        : 'Accede a Llévalo en Carabobo'}
                </p>
              </div>

              {authMode === 'choice' ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => { setErrorAuth(''); setAuthMode('login'); }}
                    className="w-full rounded-2xl bg-[#FF5722] px-5 py-4 text-left text-white shadow-sm transition hover:bg-[#F4511E]"
                  >
                    <span className="block text-sm font-black">Iniciar sesión</span>
                    <span className="mt-1 block text-xs text-white/85">Ya tengo una cuenta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setErrorAuth(''); setAuthMode('register'); }}
                    className={`w-full rounded-2xl border px-5 py-4 text-left transition ${darkMode ? 'border-slate-700 bg-slate-950 hover:border-orange-600' : 'border-orange-200 bg-orange-50 hover:border-orange-400'}`}
                  >
                    <span className={`block text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Crear una cuenta</span>
                    <span className="mt-1 block text-xs text-slate-500">Regístrate como cliente o repartidor</span>
                  </button>
                </div>
              ) : authMode === 'pending' ? (
                <div className="space-y-4">
                  {registroPendiente?.etapa === 'correo' ? (
                    <form onSubmit={verificarCodigoCorreo} className="space-y-4">
                      <p className={`rounded-2xl border p-4 text-sm leading-relaxed ${darkMode ? 'border-slate-700 bg-slate-950 text-slate-200' : 'border-orange-100 bg-orange-50 text-slate-700'}`}>
                        {registroPendiente.mensaje}
                        {registroPendiente.email && <strong className="mt-2 block break-all">{registroPendiente.email}</strong>}
                      </p>
                      <p className="text-xs text-slate-500">Revisa también la carpeta de spam. El código vence en 10 minutos.</p>
                      <label className="block text-xs font-bold">
                        Código de verificación
                        <input
                          type="text"
                          required
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          value={codigoCorreo}
                          onChange={event => setCodigoCorreo(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          className={`mt-1 w-full rounded-xl border px-4 py-3 text-center text-lg font-bold tracking-[0.5em] ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`}
                        />
                      </label>
                      {errorAuth && <div role="alert" className={`rounded-xl border p-3 text-xs font-bold ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorAuth}</div>}
                      {mensajeAuth && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{mensajeAuth}</p>}
                      <button type="submit" disabled={codigoCorreo.length !== 6} className={`w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition ${codigoCorreo.length === 6 ? 'bg-[#FF5722] hover:bg-[#F4511E]' : 'cursor-not-allowed bg-slate-400'}`}>
                        Verificar correo
                      </button>
                      <button type="button" onClick={() => void reenviarVerificacionCorreo()} className={`w-full rounded-xl border px-4 py-3 text-xs font-bold ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-orange-200 text-[#D84315] hover:bg-orange-50'}`}>
                        Reenviar código
                      </button>
                    </form>
                  ) : (
                    <p role="status" className={`rounded-2xl border p-4 text-sm leading-relaxed ${darkMode ? 'border-slate-700 bg-slate-950 text-slate-200' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                      {registroPendiente?.mensaje}
                      <span className="mt-2 block text-xs">Llévalo revisará la postulación y confirmará personalmente la identidad y los datos del vehículo antes de aprobarla.</span>
                    </p>
                  )}
                  {registroPendiente?.etapa === 'revision' && (
                    <button type="button" onClick={() => setAuthMode('login')} className={`w-full rounded-xl border px-4 py-3 text-sm font-bold transition ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-orange-200 text-[#D84315] hover:bg-orange-50'}`}>
                      Ir a iniciar sesión
                    </button>
                  )}
                </div>
              ) : authMode === 'action' ? (
                <div className="space-y-4">
                  {errorAuth && <div role="alert" className={`rounded-xl border p-3 text-xs font-bold ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorAuth}</div>}
                  {mensajeAuth && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{mensajeAuth}</p>}
                  {accionCorreo?.tipo === 'verificar' ? (
                    <div className="space-y-4">
                      <p className={`rounded-2xl border p-4 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-slate-200' : 'border-orange-100 bg-orange-50 text-slate-700'}`}>
                        Este enlace de verificación anterior todavía puede usarse para confirmar tu correo.
                      </p>
                      <label className="block text-xs font-bold">
                        Correo electrónico
                        <input type="email" required value={email} onChange={event => setEmail(event.target.value)} className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                      </label>
                      <button type="button" onClick={() => void ejecutarAccionCorreo()} className="w-full rounded-xl bg-[#FF5722] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#F4511E]">
                        Confirmar correo
                      </button>
                      <button type="button" onClick={() => void reenviarVerificacionCorreo()} className={`w-full rounded-xl border px-4 py-3 text-xs font-bold ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-orange-200 text-[#D84315] hover:bg-orange-50'}`}>
                        Solicitar un código nuevo
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={ejecutarAccionCorreo} className="space-y-3">
                      <p className={`rounded-2xl border p-4 text-xs leading-relaxed ${darkMode ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-orange-100 bg-orange-50 text-slate-600'}`}>
                        Tu postulación fue aprobada. Crea una contraseña para activar la cuenta de repartidor.
                      </p>
                      <label className="block text-xs font-bold">
                        Nueva contraseña
                        <input type="password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                      </label>
                      <label className="block text-xs font-bold">
                        Confirmar contraseña
                        <input type="password" required minLength={8} maxLength={128} value={confirmarPassword} onChange={event => setConfirmarPassword(event.target.value)} className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                      </label>
                      <p className="text-[11px] text-slate-500">Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo.</p>
                      <button type="submit" disabled={!passwordCompleta || password !== confirmarPassword} className={`w-full rounded-xl px-4 py-3 text-sm font-bold text-white ${passwordCompleta && password === confirmarPassword ? 'bg-[#FF5722] hover:bg-[#F4511E]' : 'cursor-not-allowed bg-slate-400'}`}>
                        Crear cuenta y entrar
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <>
              {authMode === 'register' && (
                <div className={`flex p-1 rounded-2xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-100'}`}>
                  <button type="button" onClick={() => setAuthRoleSelection('cliente')} className={`flex-1 py-2 text-xs font-bold rounded-xl cursor-pointer ${authRoleSelection === 'cliente' ? 'bg-[#FF5722] text-white' : (darkMode ? 'text-slate-400' : 'text-slate-600')}`}>Cliente</button>
                  <button type="button" onClick={() => setAuthRoleSelection('repartidor')} className={`flex-1 py-2 text-xs font-bold rounded-xl cursor-pointer ${authRoleSelection === 'repartidor' ? 'bg-[#FF5722] text-white' : (darkMode ? 'text-slate-400' : 'text-slate-600')}`}>Repartidor</button>
                </div>
              )}

              {errorAuth && <div role="alert" className={`rounded-xl border p-3 text-xs font-bold ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorAuth}</div>}
              {mensajeAuth && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{mensajeAuth}</p>}

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
                      <p className="mt-1 text-[10px] text-slate-500">El teléfono se guardará como no verificado; por ahora no enviamos SMS.</p>
                    </div>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Cédula de Identidad</label>
                      <div className="flex mt-1">
                        <select
                          aria-label="Tipo de documento"
                          value={tipoCedula}
                          onChange={event => setTipoCedula(event.target.value === 'E' ? 'E' : 'V')}
                          className={`rounded-l-xl border border-r-0 px-3 text-xs font-bold ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-orange-100 border-orange-200 text-[#FF5722]'}`}
                        >
                          <option value="V">V</option>
                          <option value="E">E</option>
                        </select>
                        <input type="text" required inputMode="numeric" minLength={5} value={cedulaNumero} onChange={e => setCedulaNumero(e.target.value.replace(/\D/g, ''))} placeholder="28123456" maxLength={10} className={`w-full border rounded-r-xl px-4 py-2 text-sm ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                      </div>
                    </div>
                    {authRoleSelection === 'repartidor' && (
                      <>
                        <label className="block text-xs font-bold">
                          Tipo/modelo de vehículo
                          <input type="text" required maxLength={100} value={tipoVehiculo} onChange={event => setTipoVehiculo(event.target.value)} className={`mt-1 w-full rounded-xl border px-4 py-2 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                        </label>
                        <label className="block text-xs font-bold">
                          Placa del vehículo
                          <input type="text" required maxLength={12} value={placaVehiculo} onChange={event => validarPlacaFormato(event.target.value)} placeholder="AB123CD" className={`mt-1 w-full rounded-xl border px-4 py-2 text-sm uppercase ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                          {errorPlaca && <span className="mt-1 block text-[10px] font-semibold text-red-500">{errorPlaca}</span>}
                        </label>
                        <p className={`rounded-xl border p-3 text-[11px] leading-relaxed ${darkMode ? 'border-slate-700 bg-slate-950 text-slate-400' : 'border-orange-100 bg-orange-50 text-slate-600'}`}>
                          Esto es una postulación, no una cuenta activa. No subas documentos aquí: se revisarán presencialmente. Solo podrás trabajar después de la aprobación administrativa.
                        </p>
                      </>
                    )}
                  </>
                )}

                <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Correo Electrónico</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" className={`w-full border rounded-xl px-4 py-2 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                </div>

                {(authMode === 'login' || (authMode === 'register' && authRoleSelection === 'cliente')) && <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Contraseña</label>
                  <div className="relative mt-1">
                    <input type={mostrarPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={`w-full border rounded-xl px-4 py-2 text-sm pr-12 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    <button type="button" aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={mostrarPassword} onClick={() => setMostrarPassword(!mostrarPassword)} className="password-toggle absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
                      {mostrarPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  
                  {authMode === 'register' && authRoleSelection === 'cliente' && (
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
                </div>}

                <button type="submit" disabled={authMode === 'register' && authRoleSelection === 'cliente' && !passwordCompleta} className={`w-full font-bold py-3 rounded-2xl transition shadow-md cursor-pointer mt-2 ${authMode === 'register' && authRoleSelection === 'cliente' && !passwordCompleta ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white'}`}>
                  {authMode === 'login' ? 'Iniciar Sesión' : authRoleSelection === 'repartidor' ? 'Enviar postulación' : 'Crear cuenta'}
                </button>
              </form>

              <div className="pt-2">
                {authMode === 'login' ? (
                  <div className={`rounded-2xl border p-4 text-center ${darkMode ? 'border-slate-700 bg-slate-950/60' : 'border-orange-200 bg-orange-50/70'}`}>
                    <p className={`text-sm font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>¿Nuevo en Llévalo?</p>
                    <button type="button" onClick={() => setAuthMode('register')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF5722] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#F4511E] cursor-pointer">
                      Crear cuenta nueva <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAuthMode('login')} className={`w-full rounded-xl border px-4 py-3 text-sm font-bold transition cursor-pointer ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-orange-200 text-[#D84315] hover:bg-orange-50'}`}>
                    ¿Ya tienes cuenta? Inicia sesión
                  </button>
                )}
              </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* --- VISTA CLIENTE --- */}
        {activeTab === 'cliente' && usuario?.rol === 'cliente' && (
          <>
          <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 py-4 items-start ${pedidoActivoCliente ? '' : 'hidden'}`}>
            <div className="lg:col-span-5 space-y-4">
              <div className={`space-y-4 ${darkMode ? 'text-white' : ''}`}>
                <div className="flex justify-between items-center">
                  <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Nuevo Pedido</h3>
                </div>

                <p className="carousel-swipe-cue md:hidden">Desliza para cambiar de servicio <ArrowRight size={14} /></p>
                <div className="service-type-carousel mobile-service-carousel grid grid-cols-1 min-[400px]:grid-cols-2 gap-3" role="region" aria-label="Elige el tipo de servicio" aria-roledescription="carrusel" tabIndex={0}>
                  <button type="button" onClick={() => { setServiceType('envios'); void cargarConfiguracionPago(); }} className={`rounded-2xl border p-4 text-left transition cursor-pointer ${serviceType === 'envios' ? 'border-[#FF5722] bg-orange-50 shadow-sm dark:bg-[#16090f]' : 'border-slate-200 bg-white hover:border-orange-200 dark:border-slate-800 dark:bg-slate-950'}`}>
                    <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${serviceType === 'envios' ? 'bg-[#FF5722] text-white' : 'bg-orange-100 text-[#FF5722]'}`}><Package size={19} /></span>
                    <span className={`block text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Envíos</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">Comida, mercado, paquetes y mandados</span>
                  </button>
                  <button type="button" onClick={() => { setServiceType('viajes'); void cargarConfiguracionPago(); }} className={`rounded-2xl border p-4 text-left transition cursor-pointer ${serviceType === 'viajes' ? 'border-[#FF5722] bg-orange-50 shadow-sm dark:bg-[#16090f]' : 'border-slate-200 bg-white hover:border-orange-200 dark:border-slate-800 dark:bg-slate-950'}`}>
                    <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${serviceType === 'viajes' ? 'bg-[#FF5722] text-white' : 'bg-orange-100 text-[#FF5722]'}`}><CarFront size={19} /></span>
                    <span className={`block text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Viajes</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">Traslados seguros punto a punto</span>
                  </button>
                </div>

                {!pedidoActivoCliente && pedidoExpiradoReciente && (
                  <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {pedidoExpiradoReciente.motivo_cancelacion === 'sin_repartidor'
                      ? 'La solicitud anterior se canceló automáticamente porque ningún repartidor se postuló en 60 segundos.'
                      : 'El repartidor canceló la solicitud antes de iniciar el servicio.'} Envía una nueva cuando quieras.
                  </div>
                )}

                {pedidoActivoCliente ? (
                  <div className="space-y-4 pt-2">
                    <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase text-amber-600 dark:text-amber-400">Estado del servicio en curso</span>
                        <span className="text-xs font-bold text-slate-500">{mostrarMontoPedido(pedidoActivoCliente.tarifa)}</span>
                      </div>
                      <p className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{pedidoActivoCliente.descripcion}</p>
                      <p className="text-[11px] text-slate-500 font-medium">Estado: <strong className="uppercase text-[#FF5722]">{pedidoActivoCliente.estado}</strong></p>
                      {pedidoActivoCliente.metodo_pago && pedidoActivoCliente.metodo_pago !== 'no_aplica' && (
                        <div className={`rounded-xl border p-3 text-[11px] ${pedidoActivoCliente.estado_pago === 'pagado' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'}`}>
                          <p><strong>{etiquetaMetodoPago(pedidoActivoCliente.metodo_pago)}</strong> · {pedidoActivoCliente.estado_pago === 'pagado' ? 'Pago confirmado' : 'Pago pendiente'}</p>
                          {pedidoActivoCliente.estado_pago === 'pendiente' && pedidoActivoCliente.metodo_pago === 'pago_movil' && <p className="mt-1">Un administrador verificará la referencia antes de publicar el pedido en el radar.</p>}
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
                            <Clock size={14} className={segundosRestantes === 0 ? '' : 'animate-spin'} />
                            <span>
                              {segundosRestantes === null
                                ? 'Esperando que se verifique el pago para publicar el pedido.'
                                : segundosRestantes === 0
                                  ? 'Se agotó el tiempo; cancelando la solicitud...'
                                  : `Buscando repartidor... (${segundosRestantes}s)`}
                            </span>
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
                                <p className="text-[10px] text-slate-500">{post.vehiculo}</p>
                                <div className="flex items-center space-x-1 text-[10px] text-amber-500 font-bold">
                                  <Star size={11} fill="currentColor" />
                                  <span>{post.calificacion}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1.5">
                              <button type="button" onClick={() => void abrirPerfilPublico(pedidoActivoCliente.id, post.repartidor_id)} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-orange-300 hover:text-[#FF5722] dark:border-slate-700 dark:text-slate-300">
                                Ver perfil
                              </button>
                              <button onClick={() => aceptarPostulacion(pedidoActivoCliente.id, post)} className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
                                Aceptar
                              </button>
                            </div>
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
                              <p className="text-[10px] text-slate-500">{pedidoActivoCliente.repartidor_vehiculo}</p>
                              <p className="text-[10px] font-bold text-emerald-600 flex items-center space-x-1 mt-0.5">
                                <Navigation size={11} className="animate-pulse" />
                                <span>{pedidoActivoCliente.tipo_servicio === 'viajes' ? 'Conductor en camino a tu ubicación' : 'Repartidor en camino a retirar'}</span>
                              </p>
                            </div>
                          </div>
                          {pedidoActivoCliente.repartidor_id && (
                            <button type="button" onClick={() => void abrirPerfilPublico(pedidoActivoCliente.id, pedidoActivoCliente.repartidor_id!)} className="rounded-xl border border-emerald-200 px-3 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                              Ver perfil y reputación del repartidor
                            </button>
                          )}
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

                        {renderChatPedido(pedidoActivoCliente)}

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
                        <input type="text" value={origenInput} onChange={event => buscarDireccionGeocoding(event.target.value, 'origen')} onKeyDown={event => manejarEnterEnDireccion(event, 'origen')} placeholder="Dirección, negocio, coordenadas o enlace de Maps" className={`min-w-0 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                        <button type="button" onClick={() => obtenerUbicacionActual('origen')} disabled={ubicacionCargando} aria-label="Usar mi ubicación como origen" title="Usar mi ubicación como origen" className="px-3 py-2 rounded-xl border text-xs font-bold text-[#FF5722] border-orange-200 bg-orange-50 disabled:opacity-50">
                          <Navigation size={15} />
                        </button>
                        <button type="button" aria-pressed={modoSeleccionMapa === 'origen'} onClick={() => activarSeleccionMapa('origen')} className={`px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${modoSeleccionMapa === 'origen' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>Mapa</button>
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
                      {buscandoDireccion.origen && <p className="mt-1 text-[10px] text-slate-500">Buscando…</p>}
                    </div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{serviceType === 'viajes' ? 'Destino del viaje' : 'Destino (Entrega)'}</label>
                      <div className="relative mt-1">
                        <div className="address-controls grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                        <input type="text" value={destinoInput} onChange={event => buscarDireccionGeocoding(event.target.value, 'destino')} onKeyDown={event => manejarEnterEnDireccion(event, 'destino')} placeholder="Dirección, negocio, coordenadas o enlace de Maps" className={`min-w-0 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                        <button type="button" onClick={() => obtenerUbicacionActual('destino')} disabled={ubicacionCargando} aria-label="Usar mi ubicación como destino" title="Usar mi ubicación como destino" className="px-3 py-2 rounded-xl border text-xs font-bold text-[#FF5722] border-orange-200 bg-orange-50 disabled:opacity-50">
                          <Navigation size={15} />
                        </button>
                        <button type="button" aria-pressed={modoSeleccionMapa === 'destino'} onClick={() => activarSeleccionMapa('destino')} className={`px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${modoSeleccionMapa === 'destino' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 border-red-200'}`}>Mapa</button>
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
                      {buscandoDireccion.destino && <p className="mt-1 text-[10px] text-slate-500">Buscando…</p>}
                    </div>

                    {errorGeocoding && <p role="alert" className="text-[10px] text-amber-700">{errorGeocoding}</p>}
                    {errorRuta && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{errorRuta}</p>}
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
                          <p className="text-sm font-black text-[#FF5722]">{tarifaEnBolivares || `$${tarifaTotal} USD`}</p>
                          <p className="text-[10px] text-slate-400">Base: ${tarifaTotal} USD</p>
                        </div>
                      </div>
                      )}

                      {!pedidoActivoCliente && pasoSolicitud && createPortal(
                        <div className={`${darkMode ? 'dark' : ''} fixed inset-0 z-[120] flex h-[100dvh] flex-col overflow-y-auto px-3 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] md:px-8 md:pb-6 ${darkMode ? 'bg-slate-950 text-white' : 'bg-[#FDFBF7] text-slate-800'}`} role="dialog" aria-modal="true" aria-labelledby="solicitud-title">
                          <header className={`mx-auto flex w-full max-w-6xl items-center justify-between gap-3 border-b pb-3 ${darkMode ? 'border-slate-800' : 'border-orange-100'}`}>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF5722]">
                                {pasoSolicitud === 'tipo' ? 'Paso 1 de 3' : pasoSolicitud === 'ruta' ? 'Paso 2 de 3' : 'Paso 3 de 3'}
                              </p>
                              <h2 id="solicitud-title" className="mt-1 text-lg font-black md:text-2xl">
                                {pasoSolicitud === 'tipo' ? '¿Qué necesitas hoy?' : pasoSolicitud === 'ruta' ? 'Indica la ruta' : 'Confirma tu Pago Móvil'}
                              </h2>
                            </div>
                            <button type="button" aria-label="Volver al inicio" onClick={() => { setPasoSolicitud(null); navegarA('home'); }} className={`rounded-2xl border p-2.5 ${darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600'}`}>
                              <ArrowLeft size={18} />
                            </button>
                          </header>

                          {pasoSolicitud === 'tipo' && (
                            <div className="flex flex-1 -translate-y-6 items-center justify-center py-6">
                              <div className="w-full max-w-xl space-y-5">
                                <div className="grid gap-4 sm:grid-cols-2">
                                  {([
                                    { tipo: 'envios' as const, etiqueta: 'Envío', detalle: 'Comida, mercado, paquetes y mandados', Icono: Package },
                                    { tipo: 'viajes' as const, etiqueta: 'Viaje', detalle: 'Traslado de un punto a otro', Icono: CarFront }
                                  ]).map(({ tipo, etiqueta, detalle, Icono }) => (
                                    <button key={tipo} type="button" aria-pressed={serviceType === tipo} onClick={() => setServiceType(tipo)} className={`rounded-3xl border p-6 text-left transition ${serviceType === tipo ? 'border-[#FF5722] bg-orange-50 shadow-lg dark:bg-[#16090f]' : darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                                      <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${serviceType === tipo ? 'bg-[#FF5722] text-white' : 'bg-orange-100 text-[#FF5722]'}`}><Icono size={22} /></span>
                                      <span className="block text-lg font-black">{etiqueta}</span>
                                      <span className="mt-1 block text-xs text-slate-500">{detalle}</span>
                                    </button>
                                  ))}
                                </div>
                                <button type="button" onClick={() => { setPasoSolicitud('ruta'); void cargarConfiguracionPago(); }} className="w-full rounded-2xl bg-[#FF5722] px-5 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-[#F4511E]">
                                  Aceptar y elegir direcciones <ArrowRight size={17} className="ml-1 inline" />
                                </button>
                              </div>
                            </div>
                          )}

                          {pasoSolicitud === 'ruta' && (
                            <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2.5 py-2 md:gap-3">
                              <div className="relative min-h-[220px] h-[min(43dvh,520px)] flex-1 overflow-hidden rounded-3xl border shadow-sm">
                                <React.Suspense fallback={<div className="flex h-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-500">Cargando mapa...</div>}>
                                  <MapaGoogle
                                    coordsOrigen={coordsOrigen}
                                    coordsDestino={coordsDestino}
                                    coordsUsuario={coordsUsuarioGPS}
                                    modoSeleccion={modoSeleccionMapa}
                                    onMapClick={manejarClicEnMapa}
                                    onRutaCalculada={(km, min) => { setDistanciaKm(km); setTiempoEstimadoMin(min); setErrorRuta(''); }}
                                    onErrorRuta={setErrorRuta}
                                    mostrarRuta
                                    mostrarPines
                                    seguirUsuario
                                    darkMode={darkMode}
                                    recentrarUsuario={recentrarMapa}
                                  />
                                </React.Suspense>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="relative min-w-0">
                                  <label htmlFor="solicitud-origen" className="block text-[10px] font-bold text-slate-500">
                                    {serviceType === 'viajes' ? 'Punto de partida' : 'Origen'}
                                  </label>
                                  <div className="mt-1 flex gap-2">
                                    <input id="solicitud-origen" type="text" value={origenInput} onChange={event => buscarDireccionGeocoding(event.target.value, 'origen')} onKeyDown={event => manejarEnterEnDireccion(event, 'origen')} placeholder="Dirección, negocio, coordenadas o enlace de Maps" className={`min-w-0 flex-1 rounded-2xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'}`} />
                                    <button type="button" onClick={() => obtenerUbicacionActual('origen')} disabled={ubicacionCargando} aria-label="Usar mi ubicación como origen" title="Usar mi ubicación como origen" className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 px-3 text-[#FF5722] disabled:opacity-50 dark:border-orange-900 dark:bg-orange-950/30">
                                      <Navigation size={17} className={ubicacionCargando && objetivoUbicacion === 'origen' ? 'animate-pulse' : ''} />
                                    </button>
                                    <button type="button" aria-pressed={modoSeleccionMapa === 'origen'} onClick={() => activarSeleccionMapa('origen')} aria-label="Elegir origen en el mapa" title="Elegir origen en el mapa" className={`inline-flex shrink-0 items-center justify-center rounded-2xl border px-3 transition ${modoSeleccionMapa === 'origen' ? 'border-emerald-600 bg-emerald-600 text-white' : darkMode ? 'border-emerald-900 bg-slate-900 text-emerald-300' : 'border-emerald-200 bg-white text-emerald-700'}`}>
                                      <MapPin size={17} />
                                    </button>
                                  </div>
                                  {sugerenciasOrigen.length > 0 && (
                                    <div className={`absolute left-0 right-0 top-full z-40 mt-1 max-h-36 overflow-y-auto rounded-2xl border shadow-lg ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                                      {sugerenciasOrigen.map((sugerencia, indice) => (
                                        <button type="button" key={`${sugerencia.display_name}-${indice}`} onClick={() => seleccionarSugerencia(sugerencia, 'origen')} className={`block w-full border-b p-2 text-left text-xs last:border-0 ${darkMode ? 'border-slate-800 text-slate-200 hover:bg-slate-800' : 'border-orange-50 text-slate-700 hover:bg-orange-50'}`}>{sugerencia.display_name}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="relative min-w-0">
                                  <label htmlFor="solicitud-destino" className="block text-[10px] font-bold text-slate-500">
                                    {serviceType === 'viajes' ? 'Destino del viaje' : 'Destino'}
                                  </label>
                                  <div className="mt-1 flex gap-2">
                                    <input id="solicitud-destino" type="text" value={destinoInput} onChange={event => buscarDireccionGeocoding(event.target.value, 'destino')} onKeyDown={event => manejarEnterEnDireccion(event, 'destino')} placeholder="Dirección, negocio, coordenadas o enlace de Maps" className={`min-w-0 flex-1 rounded-2xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'}`} />
                                    <button type="button" onClick={() => obtenerUbicacionActual('destino')} disabled={ubicacionCargando} aria-label="Usar mi ubicación como destino" title="Usar mi ubicación como destino" className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 px-3 text-[#FF5722] disabled:opacity-50 dark:border-orange-900 dark:bg-orange-950/30">
                                      <Navigation size={17} className={ubicacionCargando && objetivoUbicacion === 'destino' ? 'animate-pulse' : ''} />
                                    </button>
                                    <button type="button" aria-pressed={modoSeleccionMapa === 'destino'} onClick={() => activarSeleccionMapa('destino')} aria-label="Elegir destino en el mapa" title="Elegir destino en el mapa" className={`inline-flex shrink-0 items-center justify-center rounded-2xl border px-3 transition ${modoSeleccionMapa === 'destino' ? 'border-red-600 bg-red-600 text-white' : darkMode ? 'border-red-900 bg-slate-900 text-red-300' : 'border-red-200 bg-white text-red-700'}`}>
                                      <MapPin size={17} />
                                    </button>
                                  </div>
                                  {sugerenciasDestino.length > 0 && (
                                    <div className={`absolute left-0 right-0 top-full z-40 mt-1 max-h-36 overflow-y-auto rounded-2xl border shadow-lg ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-orange-100 bg-white'}`}>
                                      {sugerenciasDestino.map((sugerencia, indice) => (
                                        <button type="button" key={`${sugerencia.display_name}-${indice}`} onClick={() => seleccionarSugerencia(sugerencia, 'destino')} className={`block w-full border-b p-2 text-left text-xs last:border-0 ${darkMode ? 'border-slate-800 text-slate-200 hover:bg-slate-800' : 'border-orange-50 text-slate-700 hover:bg-orange-50'}`}>{sugerencia.display_name}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {(errorGeocoding || errorRuta || errorUbicacion) && (
                                <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                                  {errorRuta || errorGeocoding || errorUbicacion}
                                </p>
                              )}

                              <div className="flex items-center justify-between gap-2">
                                <button type="button" onClick={() => setPasoSolicitud('tipo')} className={`shrink-0 rounded-2xl border px-3 py-2.5 text-xs font-bold ${darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600'}`}><ArrowLeft size={15} className="mr-1 inline" /> Atrás</button>
                                <span className="min-w-0 text-center text-[10px] font-semibold text-slate-500">{rutaCompletaLista ? `${distanciaKm} km · ~${tiempoEstimadoMin} min` : modoSeleccionMapa === 'origen' ? 'Toca el mapa para elegir el origen' : modoSeleccionMapa === 'destino' ? 'Toca el mapa para elegir el destino' : ''}</span>
                                <button type="button" disabled={!rutaCompletaLista || esperandoNombreDireccion || distanciaKm <= 0 || tiempoEstimadoMin <= 0} onClick={() => { setPasoSolicitud('pago'); void cargarConfiguracionPago(); }} className="shrink-0 rounded-2xl bg-[#FF5722] px-3 py-2.5 text-xs font-black text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50">Continuar <ArrowRight size={15} className="ml-1 inline" /></button>
                              </div>
                            </div>
                          )}

                          {pasoSolicitud === 'pago' && (
                            <div className="flex flex-1 items-center justify-center overflow-y-auto py-5">
                              <div className="w-full max-w-lg space-y-4 py-5 md:py-7">
                                <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                                  <p className="text-[10px] font-black uppercase tracking-wider text-[#FF5722]">Pago Móvil</p>
                                  {cargandoConfiguracionPago ? <p className="mt-2 text-xs text-slate-500">Cargando datos de pago…</p> : configuracionPago?.pagoMovil.telefono ? (
                                    <div className="mt-2 space-y-1 text-xs">
                                      <p><strong>Banco:</strong> {configuracionPago.pagoMovil.banco}</p>
                                      <p><strong>Teléfono:</strong> {configuracionPago.pagoMovil.telefono}</p>
                                      <p><strong>Cédula/RIF:</strong> {configuracionPago.pagoMovil.cedula}</p>
                                      <p><strong>Titular:</strong> {configuracionPago.pagoMovil.titular}</p>
                                    </div>
                                  ) : <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Pago Móvil aún no está configurado. No se puede enviar la solicitud por ahora.</p>}
                                </div>

                                <div className={`grid grid-cols-2 gap-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                                  <div><p className="text-[10px] font-bold text-slate-500">Distancia</p><p className="mt-1 text-sm font-black">{distanciaKm} km · ~{tiempoEstimadoMin} min</p></div>
                                  <div className="text-right"><p className="text-[10px] font-bold text-slate-500">Total</p><p className="mt-1 text-sm font-black text-[#FF5722]">${tarifaUsd.toFixed(2)} USD</p><p className="text-xs font-bold">{tarifaEnBolivares || 'Tasa BCV no disponible'}</p></div>
                                </div>

                                {errorTarifas && <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{errorTarifas}</p>}
                                {tasasCambio?.desactualizada && <p role="status" className="text-[10px] text-amber-700 dark:text-amber-300">La tasa BCV mostrada corresponde al último valor disponible.</p>}

                                <label className="block text-xs font-bold">
                                  Número de comprobante
                                  <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={100} value={referenciaPago} onChange={event => setReferenciaPago(event.target.value.replace(/[^0-9]/g, ''))} placeholder="Referencia numérica de la operación" className={`mt-1 w-full rounded-2xl border px-3 py-3 ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`} />
                                </label>
                                <p className="text-[11px] leading-relaxed text-slate-500">Un administrador verificará la referencia. El servicio se publicará para los repartidores solo después de confirmar el pago.</p>
                                {errorPago && <p role="alert" className="text-xs font-semibold text-red-600">{errorPago}</p>}

                                <div className="flex gap-3">
                                  <button type="button" onClick={() => setPasoSolicitud('ruta')} className={`flex-1 rounded-2xl border px-4 py-3 text-xs font-bold ${darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600'}`}><ArrowLeft size={15} className="mr-1 inline" /> Volver al mapa</button>
                                  <button type="button" disabled={!rutaCompletaLista || !pagoPedidoCompleto || enviandoPedido || cargandoTarifas || !configuracionTarifas || !tasasCambio || cargandoConfiguracionPago || !configuracionPago?.pagoMovil.telefono} onClick={() => void handleCrearPedido()} className="flex-1 rounded-2xl bg-[#FF5722] px-4 py-3 text-xs font-black text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                                    {enviandoPedido ? 'Enviando…' : 'Enviar a revisión'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        ,
                        document.body
                      )}
                    {errorTarifas && (
                      <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        {errorTarifas}
                      </p>
                    )}
                    {tasasCambio?.desactualizada && (
                      <p role="status" className="text-[10px] text-amber-700 dark:text-amber-300">
                        No se pudo renovar la tasa; los equivalentes usan el último valor disponible del {new Date(tasasCambio.actualizadoEn).toLocaleString('es-VE')}.
                      </p>
                    )}

                    <div className={`space-y-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-white'}`}>
                        <div>
                          <h4 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Método de pago</h4>
                          <p className="mt-1 text-[10px] text-slate-500">Selecciona cómo pagarás {serviceType === 'viajes' ? 'el viaje' : 'el envío'}.</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {([
                            ['pago_movil', 'Pago Móvil']
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
                                <p className="pt-1 text-[10px] text-amber-700 dark:text-amber-400">Realiza el pago por el monto cotizado y escribe la referencia. Un administrador la verificará antes de ofrecer el pedido en el radar.</p>
                              </div>
                            ) : !cargandoConfiguracionPago && (
                              <p className="text-amber-700 dark:text-amber-400">Pago Móvil aún no está configurado. Inténtalo más tarde.</p>
                            )}
                            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={100} value={referenciaPago} onChange={e => setReferenciaPago(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Referencia numérica de la operación" className={`w-full rounded-xl border px-3 py-2 ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`} />
                          </div>
                        )}

                        {errorPago && <p role="alert" className="text-[10px] font-semibold text-red-600">{errorPago}</p>}
                      </div>

                    <button disabled={!rutaCompletaLista || esperandoNombreDireccion || distanciaKm <= 0 || tiempoEstimadoMin <= 0 || !pagoPedidoCompleto || enviandoPedido || cargandoTarifas || !configuracionTarifas || (metodoPagoViaje === 'pago_movil' && !tasasCambio)} onClick={handleCrearPedido} className={`w-full py-3 rounded-xl font-bold text-xs transition cursor-pointer shadow-md ${!rutaCompletaLista || esperandoNombreDireccion || distanciaKm <= 0 || tiempoEstimadoMin <= 0 || !pagoPedidoCompleto || enviandoPedido || cargandoTarifas || !configuracionTarifas || (metodoPagoViaje === 'pago_movil' && !tasasCambio) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white'}`}>
                      {cargandoTarifas ? 'Actualizando tarifas…' : enviandoPedido ? 'Procesando…' : serviceType === 'viajes' ? 'Solicitar viaje' : 'Publicar envío en radar'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {(!pasoSolicitud || pedidoActivoCliente) && (
            <div className="relative lg:col-span-7 h-[min(60dvh,520px)] min-h-[300px] lg:h-[calc(100dvh-140px)] rounded-3xl overflow-hidden border shadow-sm sticky top-20">
              <button type="button" onClick={() => obtenerUbicacionActual()} disabled={ubicacionCargando} className={`absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-md disabled:opacity-60 ${darkMode ? 'border-slate-600 bg-slate-800/95 text-slate-100' : 'border-white/80 bg-white/95 text-slate-800'}`}>
                <Navigation size={15} className={ubicacionCargando ? 'animate-pulse' : 'text-[#FF5722]'} />
                {ubicacionCargando ? 'Buscando...' : 'Mi ubicación'}
              </button>
              <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-500">Cargando mapa...</div>}>
                <MapaGoogle
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
                  seguirUsuario={activeTab === 'cliente'}
                  darkMode={darkMode}
                  recentrarUsuario={recentrarMapa}
                />
              </React.Suspense>
            </div>
            )}
          </div>
          </>
        )}

        {/* --- VISTA REPARTIDOR --- */}
        {activeTab === 'repartidor' && usuario?.rol === 'repartidor' && (
          <div className="space-y-6 py-4">
            <section className={`rounded-3xl border p-4 shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900/90' : 'border-orange-100 bg-white'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF5722] text-sm font-black text-white">
                    {usuario.nombre ? usuario.nombre.substring(0, 2).toUpperCase() : 'R'}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF5722]">Radar de trabajos</p>
                    <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Hola, {usuario.nombre.split(' ')[0]}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                    disponiblePushRepartidor && !errorUbicacion
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : repartidorOnline || disponiblePushRepartidor
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-500/10 text-slate-500'
                  }`}>
                    {disponiblePushRepartidor && errorUbicacion
                      ? 'GPS inestable'
                      : disponiblePushRepartidor
                      ? 'Disponible'
                      : repartidorOnline
                        ? errorUbicacion ? 'Ubicación pausada' : 'Buscando ubicación'
                        : 'Desconectado'}
                  </span>
                  <button
                    type="button"
                    disabled={(repartidorOnline && Boolean(pedidoAsignadoRepartidor)) || cambiandoEstadoRepartidor}
                    onClick={() => void cambiarEstadoRepartidor()}
                    title={pedidoAsignadoRepartidor
                      ? 'No puedes desconectarte durante una entrega activa'
                      : !disponiblePushRepartidor && !repartidorOnline
                        ? 'Activa la ubicación para conectarte'
                        : 'Cambiar disponibilidad'}
                    aria-label={repartidorOnline ? 'Desconectarme' : 'Conectarme'}
                    className={`rounded-xl p-2.5 transition ${
                      repartidorOnline
                        ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400'
                        : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <Power size={18} className={cambiandoEstadoRepartidor ? 'animate-pulse' : ''} />
                  </button>
                </div>
              </div>

              <div className={`mt-4 flex justify-end border-t pt-3 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="text-slate-500">En radar <strong className={darkMode ? 'text-white' : 'text-slate-900'}>{pedidosVisiblesRepartidor.filter(p => p.estado === 'pendiente' || p.estado === 'postulado').length}</strong></span>
                  <span className="text-slate-500">Postulaciones <strong className={darkMode ? 'text-white' : 'text-slate-900'}>{postulacionesPendientesRepartidor.length}</strong></span>
                </div>
              </div>
            </section>

            {(!coordsUsuarioGPS || errorUbicacion) && (
              <section role="alert" className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                darkMode ? 'border-amber-900/70 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}>
                <div className="flex items-start gap-3">
                  <MapPin size={19} className="mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-bold">Activa la ubicación para usar el radar</p>
                    <p className="mt-1 text-xs opacity-80">
                      {errorUbicacion || (ubicacionCargando
                        ? 'Buscando tu posición actual…'
                        : 'Necesitamos tu ubicación para mantener el mapa actualizado y habilitar trabajos cercanos.')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (Capacitor.isNativePlatform() && errorUbicacion) {
                        window.location.href = 'llevalo://location-settings';
                      } else {
                        obtenerUbicacionActual();
                      }
                    }}
                    disabled={ubicacionCargando}
                    className="rounded-xl bg-[#FF5722] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {ubicacionCargando ? 'Buscando…' : 'Activar ubicación'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void salirDelRadar()}
                    className="rounded-xl border border-current/20 px-3 py-2 text-xs font-bold"
                  >
                    {Capacitor.isNativePlatform() ? 'Salir de la app' : 'Salir del radar'}
                  </button>
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 space-y-4">
                {pedidoAsignadoRepartidor ? (
                  <div className={`border p-5 rounded-3xl shadow-sm space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-emerald-500">Servicio Asignado Activo</span>
                      <span className="text-xs font-bold text-slate-500">{mostrarMontoPedido(pedidoAsignadoRepartidor.tarifa)}</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p><strong>Cliente:</strong> {pedidoAsignadoRepartidor.cliente_nombre}</p>
                      {pedidoAsignadoRepartidor.metodo_pago && pedidoAsignadoRepartidor.metodo_pago !== 'no_aplica' && <p><strong>Pago:</strong> {etiquetaMetodoPago(pedidoAsignadoRepartidor.metodo_pago)} · {pedidoAsignadoRepartidor.estado_pago === 'pagado' ? 'Confirmado' : pedidoAsignadoRepartidor.metodo_pago === 'efectivo' ? 'Pendiente en punto A' : 'Pendiente de revisión'}</p>}
                      <p><strong>Descripción:</strong> {pedidoAsignadoRepartidor.descripcion}</p>
                      <p><strong>Origen (Punto A):</strong> {pedidoAsignadoRepartidor.origen_texto}</p>
                      <p><strong>Destino (Punto B):</strong> {pedidoAsignadoRepartidor.destino_texto}</p>
                    </div>
                    <button type="button" onClick={() => void abrirPerfilPublico(pedidoAsignadoRepartidor.id, pedidoAsignadoRepartidor.cliente_id)} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:border-orange-300 hover:text-[#FF5722] dark:border-slate-700 dark:text-slate-300">
                      Ver perfil y reputación del cliente
                    </button>
                    {mensajeNavegacion && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{mensajeNavegacion}</p>}

                    {pedidoAsignadoRepartidor.estado === 'aceptado' && (
                      <div className="space-y-2">
                        <button onClick={() => cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'entregado_repartidor')} className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white text-xs font-bold py-3 rounded-xl transition cursor-pointer shadow-sm">
                          {pedidoAsignadoRepartidor.metodo_pago === 'efectivo' && pedidoAsignadoRepartidor.estado_pago !== 'pagado'
                            ? 'Confirmar efectivo recibido e iniciar'
                            : pedidoAsignadoRepartidor.tipo_servicio === 'viajes' ? 'Iniciar viaje' : 'Llegué al Punto A / Retirado'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('¿Cancelar este trabajo? El pedido se cerrará y el cliente podrá crear otra solicitud.')) {
                              void cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'cancelado');
                            }
                          }}
                          className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"
                        >
                          Cancelar trabajo
                        </button>
                      </div>
                    )}

                    {pedidoAsignadoRepartidor.estado === 'entregado_repartidor' && (
                      <button onClick={() => cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'completado')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-xl transition cursor-pointer shadow-sm">
                        Completar Entrega en Punto B
                      </button>
                    )}
                    {renderChatPedido(pedidoAsignadoRepartidor)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#FF5722]">Oportunidades</p>
                        <h4 className={`mt-1 text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Trabajos disponibles</h4>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                        {pedidosVisiblesRepartidor.filter(p => p.estado === 'pendiente' || p.estado === 'postulado').length} activos
                      </span>
                    </div>
                    {pedidosVisiblesRepartidor.length === 0 ? (
                      <div className={`border p-8 rounded-3xl text-center ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-[#FF5722]"><Bike size={23} /></span>
                        <p className={`mt-3 text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Todo tranquilo por ahora</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">Las nuevas solicitudes aparecerán aquí. Puedes mantener activados los avisos para enterarte a tiempo.</p>
                      </div>
                    ) : (
                      pedidosVisiblesRepartidor.map(p => {
                        const yaPostulado = postulacionesReales.some(post => post.pedido_id === p.id && post.repartidor_id === usuario.id);
                        const publicadoEn = p.publicado_en ? Date.parse(p.publicado_en) : Number.NaN;
                        const segundosDisponibles = Number.isFinite(publicadoEn)
                          ? Math.max(0, Math.ceil((publicadoEn + 60_000 - horaActual) / 1000))
                          : null;
                        const progresoSolicitud = segundosDisponibles === null ? 0 : Math.min(100, (segundosDisponibles / 60) * 100);
                        return (
                          <div key={p.id} className={`driver-job-card border p-4 rounded-3xl shadow-sm space-y-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:border-orange-900' : 'bg-white border-orange-100 hover:border-orange-200'}`}>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-orange-100 text-[#FF5722]">{etiquetaTipoServicio(p.tipo_servicio)} · {p.distancia_km} km</span>
                              <span className="text-sm font-black text-[#FF5722]">{mostrarMontoPedido(p.tarifa)}</span>
                            </div>

                            <p className="text-xs font-bold">{p.descripcion}</p>
                            <p className="text-[11px] text-slate-500"><strong>Origen:</strong> {p.origen_texto}</p>
                            <p className="text-[11px] text-slate-500"><strong>Destino:</strong> {p.destino_texto}</p>
                            <button type="button" onClick={() => void abrirPerfilPublico(p.id, p.cliente_id)} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-orange-300 hover:text-[#FF5722] dark:border-slate-700 dark:text-slate-300">
                              Ver perfil del cliente
                            </button>

                            {(p.estado === 'pendiente' || p.estado === 'postulado') && segundosDisponibles !== null && (
                              <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700 bg-slate-950/70' : 'border-orange-100 bg-orange-50/60'}`}>
                                <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold">
                                  <span className="inline-flex items-center gap-1.5 text-slate-500"><Clock size={13} /> Tiempo de respuesta</span>
                                  <span className={segundosDisponibles > 10 ? 'text-[#FF5722]' : 'text-amber-600 dark:text-amber-400'}>
                                    {yaPostulado ? 'Esperando selección del cliente' : `${segundosDisponibles}s`}
                                  </span>
                                </div>
                                <div
                                  role="progressbar"
                                  aria-label="Tiempo de la solicitud"
                                  aria-valuemin={0}
                                  aria-valuemax={60}
                                  aria-valuenow={segundosDisponibles}
                                  className={`h-1.5 overflow-hidden rounded-full ${darkMode ? 'bg-slate-800' : 'bg-orange-100'}`}
                                >
                                  <div className="h-full rounded-full bg-gradient-to-r from-[#FF5722] to-amber-400 transition-[width] duration-1000 ease-linear" style={{ width: `${progresoSolicitud}%` }} />
                                </div>
                              </div>
                            )}

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
                              <button disabled={!disponiblePushRepartidor} onClick={() => postularsePedido(p.id)} className={`w-full py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${!disponiblePushRepartidor ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white shadow-sm'}`}>
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
                <button type="button" onClick={() => obtenerUbicacionActual()} disabled={ubicacionCargando} className={`absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-md disabled:opacity-60 ${darkMode ? 'border-slate-600 bg-slate-800/95 text-slate-100' : 'border-white/80 bg-white/95 text-slate-800'}`}>
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
                  <MapaGoogle
                    coordsOrigen={
                      pedidoAsignadoRepartidor
                        ? { lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon }
                        : null
                    }
                    coordsDestino={
                      pedidoAsignadoRepartidor?.estado === 'aceptado'
                        ? { lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon }
                        : (pedidoAsignadoRepartidor?.estado === 'entregado_repartidor' ? { lat: pedidoAsignadoRepartidor.destino_lat, lng: pedidoAsignadoRepartidor.destino_lon } : null)
                    }
                    coordsUsuario={coordsUsuarioGPS}
                    mostrarRuta={Boolean(pedidoAsignadoRepartidor)}
                    mostrarPines={true}
                    navegacionActiva={Boolean(pedidoAsignadoRepartidor)}
                    seguirUsuario={activeTab === 'repartidor'}
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
                  <button
                    type="button"
                    aria-label="Cambiar foto de perfil"
                    onClick={() => inputFotoPerfilRef.current?.click()}
                    disabled={guardandoPerfil}
                    aria-busy={guardandoPerfil}
                    className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white/70 bg-white/20 text-2xl font-black shadow-md disabled:opacity-70"
                  >
                    {fotoLocal ? <img src={fotoLocal} alt="" className="h-full w-full object-cover" /> : usuario.nombre.slice(0, 1).toUpperCase()}
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      <Camera size={21} />
                    </span>
                  </button>
                  <input ref={inputFotoPerfilRef} type="file" accept="image/*" onChange={manejarCambioFotoPerfil} className="hidden" />
                  <div className="text-center sm:text-left">
                    <h2 className="text-2xl font-black">{usuario.nombre}</h2>
                    <span className="mt-2 inline-flex rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold capitalize">{usuario.rol === 'repartidor' ? 'Repartidor' : 'Cliente'}</span>
                    {resumenCalificaciones && (
                      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold sm:justify-start">
                        <Star size={14} fill="currentColor" />
                        {resumenCalificaciones.perfil.cantidad > 0
                          ? `${resumenCalificaciones.perfil.promedio.toFixed(2)} · ${resumenCalificaciones.perfil.cantidad} reseñas`
                          : 'Aún sin reseñas'}
                        <span className="rounded-full bg-white/20 px-2 py-0.5">{resumenCalificaciones.perfil.rango}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {usuario.es_admin && (
                <div className={`flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between md:px-8 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                  <h3 className="text-sm font-black">Administración</h3>
                  <button type="button" onClick={() => { navegarA('admin'); void cargarPanelAdmin(); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5722] px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-[#F4511E]">
                    <Activity size={16} /> Abrir administración
                  </button>
                </div>
              )}

              {resumenCalificaciones && (
                <section className={`border-b p-5 md:px-8 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`} aria-labelledby="rating-history-title">
                  <div className="mb-4">
                    <h3 id="rating-history-title" className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Calificaciones de pedidos</h3>
                  </div>
                  {resumenCalificaciones.pedidos.length === 0 ? (
                    <p className="text-xs text-slate-500">Sin pedidos para calificar.</p>
                  ) : (
                    <div id="rating-history-list" className="space-y-3">
                      {resumenCalificaciones.pedidos
                        .slice(0, calificacionesExpandidas ? undefined : 3)
                        .map(pedido => {
                        const estrellas = estrellasSeleccionadas[pedido.pedido_id] ?? 0;
                        return (
                          <article key={pedido.pedido_id} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-slate-50'}`}>
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-500/10 font-bold text-[#FF5722]">
                                {pedido.contraparte_foto
                                  ? <img src={pedido.contraparte_foto} alt="" className="h-full w-full object-cover" />
                                  : pedido.contraparte_nombre.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <p className={`text-xs font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{pedido.contraparte_nombre}</p>
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  {etiquetaTipoServicio(pedido.tipo_servicio)} · {new Date(pedido.creado_en).toLocaleDateString('es-VE')}
                                </p>
                              </div>
                            </div>
                            {pedido.mis_estrellas > 0 ? (
                              <div className="flex items-center gap-1 text-amber-500" aria-label={`Calificaste con ${pedido.mis_estrellas} de 5 estrellas`}>
                                {Array.from({ length: 5 }, (_, index) => (
                                  <Star key={index} size={16} fill={index < pedido.mis_estrellas ? 'currentColor' : 'none'} />
                                ))}
                                <span className="ml-1 text-[10px] font-bold">Enviada</span>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center" aria-label={`Selecciona de 1 a 5 estrellas para ${pedido.contraparte_nombre}`}>
                                  {Array.from({ length: 5 }, (_, index) => {
                                    const value = index + 1;
                                    return (
                                      <button key={value} type="button" aria-label={`${value} estrellas`} aria-pressed={estrellas === value} onClick={() => setEstrellasSeleccionadas(current => ({ ...current, [pedido.pedido_id]: value }))} className="rounded-lg p-1 text-amber-500 transition hover:scale-110">
                                        <Star size={19} fill={value <= estrellas ? 'currentColor' : 'none'} />
                                      </button>
                                    );
                                  })}
                                </div>
                                <button type="button" disabled={estrellas < 1 || calificandoPedidoId === pedido.pedido_id} onClick={() => void calificarPedido(pedido.pedido_id)} className="rounded-xl bg-[#FF5722] px-3 py-2 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                                  {calificandoPedidoId === pedido.pedido_id ? 'Enviando…' : 'Enviar'}
                                </button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {resumenCalificaciones.total_pedidos > 3 && (
                        <button
                          type="button"
                          aria-expanded={calificacionesExpandidas}
                          aria-controls="rating-history-list"
                          onClick={() => void alternarHistorialCalificaciones()}
                          disabled={cargandoHistorialCalificaciones}
                          className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-orange-200 text-[#D84315] hover:bg-orange-50'}`}
                        >
                          {cargandoHistorialCalificaciones
                            ? 'Cargando calificaciones…'
                            : calificacionesExpandidas
                            ? 'Mostrar menos'
                            : `Ver todas las calificaciones (${resumenCalificaciones.total_pedidos})`}
                          <ChevronDown size={16} className={`transition-transform ${calificacionesExpandidas ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )}

              {errorPerfil && <p role="alert" className={`mx-5 mt-5 rounded-xl border p-3 text-xs font-semibold md:mx-8 ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorPerfil}</p>}

              <div className={`grid gap-6 p-5 md:p-8 ${usuario.rol === 'repartidor' ? 'md:grid-cols-2' : ''}`}>
                <div className="space-y-4">
                  <div>
                    <h3 className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos de la cuenta</h3>
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
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cédula de identidad</p>
                      <p className="mt-1 text-sm font-semibold">{usuario.cedula || 'No registrada en esta cuenta'}</p>
                    </div>
                    {usuario.rol === 'repartidor' && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vehículo registrado</p>
                        <p className="mt-1 text-sm font-semibold">{usuario.vehiculo || 'Añade los datos de tu vehículo'}</p>
                        {usuario.placa && <p className="mt-0.5 text-xs text-slate-500">Placa: {usuario.placa}</p>}
                      </div>
                    )}
                  </div>
                  {usuario.rol === 'repartidor'
                    && (permisoAvisosRepartidor === 'denied'
                      || (permisoAvisosRepartidor === 'granted' && !avisosRepartidorActivos)) && (
                    <div className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${darkMode ? 'border-amber-900/60 bg-amber-950/20' : 'border-amber-200 bg-amber-50/70'}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <BellOff size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                          <h3 className="text-sm font-bold">Notificaciones</h3>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {permisoAvisosRepartidor === 'denied'
                              ? 'Habilítalas en los ajustes de tu dispositivo o navegador para recibir trabajos.'
                              : 'Los avisos de nuevos trabajos están silenciados.'}
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => void cambiarAvisosRepartidor()} className="shrink-0 rounded-xl bg-[#FF5722] px-3 py-2 text-[11px] font-bold text-white">
                        {permisoAvisosRepartidor === 'denied' ? 'Reintentar' : 'Reactivar'}
                      </button>
                    </div>
                  )}
                  <div className={`space-y-4 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                    <div>
                      <h3 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Apariencia</h3>
                      <p className="mt-1 text-xs text-slate-500">Elige cómo se muestra Llévalo</p>
                    </div>
                    <div role="group" aria-label="Preferencia de apariencia" className="grid grid-cols-3 gap-2">
                      {(['system', 'light', 'dark'] as const).map(preference => {
                        const selected = preferenciaTema === preference;
                        const label = preference === 'system' ? 'Sistema' : preference === 'light' ? 'Claro' : 'Oscuro';
                        const Icon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;
                        return (
                          <button
                            key={preference}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => cambiarPreferenciaTema(preference)}
                            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-bold transition-colors ${
                              selected
                                ? 'border-[#FF5722] bg-[#FF5722]/10 text-[#FF5722]'
                                : darkMode
                                  ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {usuario.rol === 'repartidor' && (
                  <form onSubmit={guardarPerfil} className="space-y-4">
                    <h3 className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos del vehículo</h3>
                    <div className={`space-y-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
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
                    <button type="submit" disabled={guardandoPerfil || Boolean(errorPlaca)} className="w-full rounded-xl bg-[#FF5722] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#F4511E] disabled:cursor-not-allowed disabled:opacity-50">
                      {guardandoPerfil ? 'Guardando…' : 'Guardar datos del vehículo'}
                    </button>
                  </form>
                )}
              </div>
              <div className={`border-t p-5 md:px-8 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60 sm:w-auto"
                >
                  <LogOut size={17} /> Cerrar sesión
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'admin' && usuario?.es_admin && (
          <section className="mx-auto w-full max-w-5xl space-y-4 py-4 md:space-y-5 md:py-8">
            <div className={`flex flex-col gap-3 rounded-3xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
              <h2 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Administración</h2>
              <div className="flex flex-wrap gap-2">
                {avisosAdminActivos ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <Bell size={14} /> Avisos activos
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void activarAvisosAdmin()}
                    disabled={permisoAvisosAdmin === 'granted' && !errorAvisosAdmin}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-bold text-[#FF5722] disabled:opacity-60 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300"
                  >
                    <Bell size={14} />
                    {permisoAvisosAdmin === 'granted' && !errorAvisosAdmin
                      ? 'Activando avisos…'
                      : permisoAvisosAdmin === 'granted' ? 'Reintentar avisos' : 'Activar avisos'}
                  </button>
                )}
                <button type="button" aria-pressed={usuario.rol === 'cliente'} onClick={() => void cambiarPerspectivaAdmin('cliente')} className={`rounded-xl border px-3 py-2 text-[11px] font-bold ${usuario.rol === 'cliente' ? darkMode ? 'border-[#FF5722] bg-[#16090f] text-orange-300' : 'border-[#FF5722] bg-orange-50 text-[#FF5722]' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Usar como cliente</button>
                <button type="button" aria-pressed={usuario.rol === 'repartidor'} onClick={() => void cambiarPerspectivaAdmin('repartidor')} className={`rounded-xl border px-3 py-2 text-[11px] font-bold ${usuario.rol === 'repartidor' ? darkMode ? 'border-[#FF5722] bg-[#16090f] text-orange-300' : 'border-[#FF5722] bg-orange-50 text-[#FF5722]' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Usar como repartidor</button>
                <button type="button" onClick={() => void cargarPanelAdmin()} disabled={cargandoAdmin} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-bold text-[#FF5722] disabled:opacity-50 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
                  {cargandoAdmin ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>
            </div>

            {errorAvisosAdmin && <p role="status" className={`rounded-xl border p-3 text-xs ${darkMode ? 'border-amber-900 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{errorAvisosAdmin}</p>}
            {errorAdmin && <p role="alert" className={`rounded-xl border p-3 text-xs font-semibold ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorAdmin}</p>}
            {mensajeAdmin && <p role="status" className={`rounded-xl border p-3 text-xs font-semibold ${darkMode ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{mensajeAdmin}</p>}

            <div role="tablist" aria-label="Secciones de administración" className={`admin-section-tabs flex gap-2 overflow-x-auto rounded-2xl border p-2.5 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-orange-100 bg-white'}`}>
              {([
                ['actividad', 'Actividad'],
                ['solicitudes', 'Solicitudes'],
                ['pedidos', 'Pedidos'],
                ['pagos', 'Pagos'],
                ['tarifas', 'Tarifas'],
                ['archivos', 'Chats']
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  id={`admin-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={seccionAdmin === id}
                  aria-controls="admin-section-panel"
                  onClick={() => setSeccionAdmin(id)}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition ${seccionAdmin === id ? 'bg-[#FF5722] text-white shadow-sm' : darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-orange-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div id="admin-section-panel" role="tabpanel" aria-labelledby={`admin-tab-${seccionAdmin}`} className="space-y-4">
            {seccionAdmin === 'archivos' && (
            <AdminAccordion
              title="Archivos de chat y evidencia"
              darkMode={darkMode}
              badge={<span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-[#FF5722]">{archivosChatAdmin.length}</span>}
            >
              {archivosChatAdmin.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">No hay archivos de chat disponibles.</p>
              ) : (
                <div className="space-y-3">
                  {archivosChatAdmin.map(archivo => (
                    <article key={archivo.pedido_id} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${darkMode ? 'border-slate-700 bg-slate-950/70' : 'border-slate-200 bg-white'}`}>
                      <div className="space-y-1 text-xs">
                        <h3 className="font-black">Pedido #{archivo.pedido_id} · {etiquetaTipoServicio(archivo.tipo_servicio)}</h3>
                        <p><strong>Cliente:</strong> {archivo.cliente_nombre} · <strong>Repartidor:</strong> {archivo.repartidor_nombre || 'No asignado'}</p>
                        <p><strong>Inició:</strong> {archivo.iniciado_en ? new Date(archivo.iniciado_en).toLocaleString('es-VE') : 'No registrada'} · <strong>Finalizó:</strong> {new Date(archivo.completado_en).toLocaleString('es-VE')}</p>
                        <p><strong>Duración:</strong> {etiquetaDuracion(archivo.duracion_segundos)} · <strong>Mensajes:</strong> {archivo.cantidad_mensajes}</p>
                        <p className="text-[10px] text-slate-500">Disponible hasta {new Date(archivo.vence_en).toLocaleString('es-VE')}</p>
                      </div>
                      <button type="button" onClick={() => void descargarArchivoChatAdmin(archivo.pedido_id)} className="shrink-0 rounded-xl bg-[#FF5722] px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-[#F4511E]">
                        Descargar .json.gz
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </AdminAccordion>
            )}

            {seccionAdmin === 'solicitudes' && (
            <AdminAccordion
              title="Postulaciones de repartidores"
              darkMode={darkMode}
              badge={<span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-[#FF5722]">{postulacionesAdmin.length}</span>}
            >
              <div className="space-y-3">
                <p className={`rounded-xl border p-3 text-[11px] leading-relaxed ${darkMode ? 'border-slate-700 bg-slate-950 text-slate-400' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                  El correo sí está confirmado. El teléfono y la identidad no tienen verificación digital: comprueba cédula, persona, vehículo y documentos originales durante la entrevista. Esta etapa todavía no recibe ni almacena fotos de documentos.
                </p>
                {postulacionesAdmin.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500">No hay postulaciones pendientes de revisión ni activación.</p>
                ) : postulacionesAdmin.map(postulacion => (
                  <article key={postulacion.id} className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-950/70' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1 text-xs">
                        <h3 className={`font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{postulacion.nombre}</h3>
                        <p className="break-all text-slate-500">{postulacion.email}</p>
                        <p><strong>Teléfono:</strong> {postulacion.telefono} <span className={postulacion.telefono_verificado ? 'text-emerald-600' : 'text-amber-600'}>({postulacion.telefono_verificado ? 'comprobado presencialmente' : 'pendiente de comprobación'})</span></p>
                        <p><strong>Cédula:</strong> {postulacion.cedula}</p>
                        <p><strong>Vehículo:</strong> {postulacion.vehiculo} · <strong>Placa:</strong> {postulacion.placa}</p>
                        <p className="text-[10px] text-slate-500">
                          Correo confirmado · {postulacion.estado === 'aprobada' ? 'Esperando que cree su contraseña' : `Postuló ${new Date(postulacion.creado_en).toLocaleString('es-VE')}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {postulacion.estado === 'pendiente_revision' ? (
                          <>
                            <button type="button" onClick={() => void aprobarPostulacionRepartidor(postulacion)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-700">
                              Aprobar tras entrevista
                            </button>
                            <button type="button" onClick={() => void rechazarPostulacionRepartidor(postulacion)} className="rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30">
                              Rechazar
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => void reenviarInvitacionRepartidor(postulacion)} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-bold text-[#FF5722] transition hover:bg-orange-100">
                            Reenviar activación
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </AdminAccordion>
            )}

            {seccionAdmin === 'pedidos' && (
            <AdminAccordion
              title="Buscar pedido"
              darkMode={darkMode}
              badge={resultadosBusquedaAdmin.length > 0 ? <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-[#FF5722]">{resultadosBusquedaAdmin.length} resultados</span> : undefined}
            >
              <div className="space-y-4">
                <label className="block text-xs font-bold">
                  Buscar por
                  <select
                    value={modoBusquedaAdmin}
                    onChange={event => {
                      const modo = event.target.value;
                      if (modo === 'codigo' || modo === 'fecha' || modo === 'texto') {
                        setModoBusquedaAdmin(modo);
                        if (modo === 'codigo') {
                          setBusquedaAdmin(actual => actual.replace(/\D/g, ''));
                        }
                        setResultadosBusquedaAdmin([]);
                        setBusquedaEjecutadaAdmin(false);
                        setSugerenciasBusquedaAdmin([]);
                        setErrorAutocompletadoAdmin('');
                        setMostrarSugerenciasAdmin(false);
                        setErrorAdmin('');
                      }
                    }}
                    className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm sm:max-w-xs ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <option value="codigo">Código del pedido (solo números)</option>
                    <option value="fecha">Fecha y hora</option>
                    <option value="texto">Cliente, correo, sector u otro dato</option>
                  </select>
                </label>
                <form onSubmit={buscarPedidosAdmin} className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    {modoBusquedaAdmin === 'fecha' ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[11px] font-semibold text-slate-500">
                            Fecha (opcional)
                            <input
                              type="date"
                              value={fechaBusquedaAdmin}
                              onChange={event => {
                                setFechaBusquedaAdmin(event.target.value);
                                setResultadosBusquedaAdmin([]);
                                setBusquedaEjecutadaAdmin(false);
                                setErrorAdmin('');
                                setSugerenciasBusquedaAdmin([]);
                                setErrorAutocompletadoAdmin('');
                                setMostrarSugerenciasAdmin(true);
                              }}
                              onFocus={() => setMostrarSugerenciasAdmin(true)}
                              onBlur={() => window.setTimeout(() => setMostrarSugerenciasAdmin(false), 120)}
                              className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`}
                            />
                          </label>
                          <label className="text-[11px] font-semibold text-slate-500">
                            Hora (opcional)
                            <input
                              type="time"
                              value={horaBusquedaAdmin}
                              onChange={event => {
                                setHoraBusquedaAdmin(event.target.value);
                                setResultadosBusquedaAdmin([]);
                                setBusquedaEjecutadaAdmin(false);
                                setErrorAdmin('');
                                setSugerenciasBusquedaAdmin([]);
                                setErrorAutocompletadoAdmin('');
                                setMostrarSugerenciasAdmin(true);
                              }}
                              onFocus={() => setMostrarSugerenciasAdmin(true)}
                              onBlur={() => window.setTimeout(() => setMostrarSugerenciasAdmin(false), 120)}
                              className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`}
                            />
                          </label>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">Selecciona fecha, hora o ambas.</p>
                      </>
                    ) : (
                      <input
                        type="search"
                        inputMode={modoBusquedaAdmin === 'codigo' ? 'numeric' : 'search'}
                        pattern={modoBusquedaAdmin === 'codigo' ? '[0-9]*' : undefined}
                        maxLength={modoBusquedaAdmin === 'codigo' ? 12 : 120}
                        value={busquedaAdmin}
                        onChange={event => {
                          const value = modoBusquedaAdmin === 'codigo'
                            ? event.target.value.replace(/\D/g, '')
                            : event.target.value;
                          setBusquedaAdmin(value);
                          setResultadosBusquedaAdmin([]);
                          setBusquedaEjecutadaAdmin(false);
                          setErrorAdmin('');
                          setSugerenciasBusquedaAdmin([]);
                          setErrorAutocompletadoAdmin('');
                          setMostrarSugerenciasAdmin(true);
                        }}
                        onFocus={() => setMostrarSugerenciasAdmin(true)}
                        onBlur={() => window.setTimeout(() => setMostrarSugerenciasAdmin(false), 120)}
                        placeholder={modoBusquedaAdmin === 'codigo' ? 'Ej.: 000039' : 'Correo, cliente o sector'}
                        className={`w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`}
                      />
                    )}
                    {mostrarSugerenciasAdmin && sugerenciasBusquedaAdmin.length > 0 && (
                      <div role="listbox" aria-label="Pedidos sugeridos" className={`absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-2xl border p-1 shadow-xl ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                        {sugerenciasBusquedaAdmin.slice(0, 6).map(pedido => (
                          <button
                            key={pedido.id}
                            type="button"
                            role="option"
                            aria-selected="false"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                              setModoBusquedaAdmin('codigo');
                              setBusquedaAdmin(String(pedido.id));
                              setResultadosBusquedaAdmin([pedido]);
                              setBusquedaEjecutadaAdmin(true);
                              setMostrarSugerenciasAdmin(false);
                            }}
                            className={`flex w-full flex-col items-start rounded-xl px-3 py-2 text-left ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-orange-50'}`}
                          >
                            <span className="text-xs font-bold text-[#FF5722]">{pedido.codigo} · {pedido.cliente_nombre}</span>
                            <span className="text-[10px] text-slate-500">{pedido.origen_texto} · {new Date(pedido.creado_en || '').toLocaleString('es-VE')}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={cargandoBusquedaAdmin} className="rounded-xl bg-[#FF5722] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                    {cargandoBusquedaAdmin ? 'Buscando…' : 'Buscar'}
                  </button>
                </form>
                {errorAutocompletadoAdmin && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{errorAutocompletadoAdmin}</p>}
                {busquedaEjecutadaAdmin && modoBusquedaAdmin === 'fecha' && resultadosBusquedaAdmin.length === 0 && !cargandoBusquedaAdmin && !errorAdmin && (
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">No se encontraron pedidos en ese momento.</p>
                )}
                {busquedaEjecutadaAdmin && modoBusquedaAdmin !== 'fecha' && resultadosBusquedaAdmin.length === 0 && !cargandoBusquedaAdmin && !errorAdmin && (
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">No se encontraron pedidos con esa búsqueda.</p>
                )}
                {resultadosBusquedaAdmin.length > 0 && (
                  <ol className="max-h-80 space-y-2 overflow-y-auto">
                    {resultadosBusquedaAdmin.map(pedido => (
                      <li key={pedido.id} className={`rounded-2xl border p-3 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-black text-[#FF5722]">{pedido.codigo} · {etiquetaTipoServicio(pedido.tipo_servicio)}</p>
                          <span className="text-[10px] capitalize text-slate-500">{pedido.estado}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold">{pedido.cliente_nombre} · {pedido.cliente_email}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{pedido.origen_texto} → {pedido.destino_texto}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {mostrarMontoPedido(pedido.tarifa)} · {etiquetaMetodoPago(pedido.metodo_pago)} · {new Date(pedido.creado_en || '').toLocaleString('es-VE')}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </AdminAccordion>

            )}
            {seccionAdmin === 'tarifas' && (
            <AdminAccordion
              title="Tarifas de envíos y viajes"
              darkMode={darkMode}
              badge={tasasCambio ? <span className="text-xs font-bold text-[#FF5722]">Dólar BCV · {formatoMoneda(tasasCambio.bolivaresPorDolar)}</span> : undefined}
            >
              <div className="space-y-4">
              <form onSubmit={guardarTarifasAdmin} className="grid gap-3 sm:grid-cols-2">
                {([
                  ['enviosPorKm', 'Envíos por kilómetro (USD)'],
                  ['viajesDesde1KmPorKm', `Viajes desde 1 km y menos de ${configuracionTarifasAdmin.viajesLargosDesdeKm} km (USD/km)`],
                  ['viajesLargosPorKm', `Viajes largos desde ${configuracionTarifasAdmin.viajesLargosDesdeKm} km (USD/km)`],
                  ['tarifaMinima', 'Tarifa mínima (USD)']
                ] as const).map(([field, label]) => (
                  <label key={field} className="text-xs font-semibold">
                    {label}
                    <input
                      type="number"
                      min="0.01"
                      max="1000"
                      step="0.01"
                      required
                      value={configuracionTarifasAdmin[field]}
                      onChange={event => setConfiguracionTarifasAdmin(current => ({ ...current, [field]: Number(event.target.value) }))}
                      className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`}
                    />
                  </label>
                ))}
                <div className={`rounded-xl border p-3 text-[11px] sm:col-span-2 ${darkMode ? 'border-slate-800 bg-slate-950/60 text-slate-300' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                  {tasasCambio && configuracionTarifas && (
                    <p className="text-sm font-bold">1 USD = {formatoMoneda(convertirDolares(1, tasasCambio))} <span className="text-[10px] font-normal text-slate-500">· Tasa BCV actualizada {new Date(tasasCambio.actualizadoEn).toLocaleString('es-VE')}</span></p>
                  )}
                  {tasasCambio?.desactualizada && <p className="mt-1 text-amber-600 dark:text-amber-300">Mostrando la última tasa disponible; la actualización externa falló.</p>}
                  <p className="mt-1">Las tarifas se calculan en USD y se muestran en bolívares a tasa BCV. Los viajes menores de 1 km cobran la tarifa mínima; desde 1 km se aplica la tarifa por kilómetro, y desde 25 km la tarifa de viaje largo. Las carreras conservan la tarifa mínima como piso.</p>
                </div>
                {errorTarifas && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:col-span-2">{errorTarifas}</p>}
                <button type="submit" disabled={!configuracionTarifas || cargandoTarifas} className="rounded-xl bg-[#FF5722] px-5 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
                  {cargandoTarifas ? 'Cargando tarifas…' : 'Guardar tarifas globales'}
                </button>
              </form>
              </div>
            </AdminAccordion>

            )}
            {seccionAdmin === 'actividad' && (
            <AdminAccordion
              title="Monitor de actividad"
              darkMode={darkMode}
              badge={
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  {metricasAdmin ? `${metricasAdmin.usuarios_activos} activos` : 'En vivo'}
                </span>
              }
            >
              <div className="space-y-5">
              <div className="horizontal-story-carousel admin-metric-carousel" role="region" aria-label="Métricas de actividad" aria-roledescription="carrusel" tabIndex={0}>
                <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                  <Users size={17} className="text-[#FF5722]" />
                  <p className="mt-3 text-2xl font-black">{metricasAdmin?.cuentas_totales ?? '—'}</p>
                  <p className="text-[11px] font-semibold text-slate-500">Cuentas registradas</p>
                  <p className="mt-1 text-[10px] text-slate-400">{metricasAdmin?.clientes_totales ?? '—'} clientes · {metricasAdmin?.repartidores_totales ?? '—'} repartidores</p>
                </article>
                <article className={`rounded-2xl border p-4 ${darkMode ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-emerald-100 bg-emerald-50/60'}`}>
                  <Activity size={17} className="text-emerald-600 dark:text-emerald-400" />
                  <p className="mt-3 text-2xl font-black">{metricasAdmin?.usuarios_activos ?? '—'}</p>
                  <p className="text-[11px] font-semibold text-slate-500">Usuarios activos</p>
                  <p className="mt-1 text-[10px] text-slate-400">Conectados en el último minuto</p>
                </article>
                <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                  <UserRound size={17} className="text-sky-500" />
                  <p className="mt-3 text-2xl font-black">{metricasAdmin?.clientes_activos ?? '—'}</p>
                  <p className="text-[11px] font-semibold text-slate-500">Clientes activos</p>
                  <p className="mt-1 text-[10px] text-slate-400">De {metricasAdmin?.clientes_totales ?? '—'} registrados</p>
                </article>
                <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                  <Bike size={17} className="text-amber-500" />
                  <p className="mt-3 text-2xl font-black">{metricasAdmin?.repartidores_activos ?? '—'}</p>
                  <p className="text-[11px] font-semibold text-slate-500">Repartidores activos</p>
                  <p className="mt-1 text-[10px] text-slate-400">De {metricasAdmin?.repartidores_totales ?? '—'} registrados</p>
                </article>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black">Actividad reciente</h4>
                    <p className="mt-1 text-[11px] text-slate-500">Cuentas, solicitudes, asignaciones y cambios de estado.</p>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">Últimos {actividadAdmin.length}</span>
                </div>
                {actividadAdmin.length === 0 ? (
                  <p className={`rounded-2xl border p-4 text-xs text-slate-500 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                    Las acciones aparecerán aquí a medida que se registren.
                  </p>
                ) : (
                  <ol className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                    {actividadAdmin.map((evento) => (
                      <li key={evento.id} className={`flex gap-3 rounded-2xl border p-3 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#FF5722]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold">{evento.actor_nombre} <span className="font-normal capitalize text-slate-500">· {evento.actor_rol}</span></p>
                            <time className="text-[10px] text-slate-500">{new Date(evento.creado_en).toLocaleString('es-VE')}</time>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{evento.resumen}</p>
                          {evento.pedido_id && <p className="mt-1 text-[10px] font-semibold text-[#FF5722]">{codigoPedido(evento.pedido_id)}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              </div>
            </AdminAccordion>

              )}
              {seccionAdmin === 'pagos' && (
            <AdminAccordion
              title="Pagos y configuración"
              darkMode={darkMode}
              badge={pagosPendientesAdmin.length > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">{pagosPendientesAdmin.length} pendientes</span> : undefined}
            >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className={`space-y-4 rounded-3xl border p-5 shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
                <div>
                  <h3 className="text-base font-black">Pagos y reembolsos de Pago Móvil</h3>
                  <p className="mt-1 text-xs text-slate-500">Verifica el abono en el banco; si un pedido se canceló, devuelve el monto antes de confirmarlo.</p>
                </div>
                {pagosPendientesAdmin.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950">No hay pagos ni reembolsos pendientes.</p>
                ) : pagosPendientesAdmin.map(pago => (
                  <article id={`admin-pago-${pago.id}`} key={pago.id} className={`space-y-3 rounded-2xl border p-4 ${pagoNotificadoId === pago.id ? 'ring-2 ring-[#FF5722] ring-offset-2 dark:ring-offset-slate-900' : ''} ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">{pago.cliente_nombre}</p>
                        <p className="text-[11px] text-slate-500">{pago.cliente_email}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${pago.estado_pago === 'reembolso_pendiente' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        {pago.estado_pago === 'reembolso_pendiente' ? `Reembolso · ${codigoPedido(pago.id)}` : `Pago · ${codigoPedido(pago.id)}`}
                      </span>
                    </div>
                    <p className="text-xs"><strong>Servicio:</strong> {etiquetaTipoServicio(pago.tipo_servicio || '')}</p>
                    <p className="text-xs"><strong>Referencia:</strong> {pago.referencia_pago || 'Sin referencia'}</p>
                    <p className="text-xs"><strong>Monto:</strong> {mostrarMontoPedido(pago.tarifa)}</p>
                    <p className="text-[11px] text-slate-500"><strong>Detalle:</strong> {pago.descripcion}</p>
                    <p className="text-[11px] text-slate-500">{pago.origen_texto} → {pago.destino_texto}</p>
                    {pago.estado_pago === 'reembolso_pendiente' ? (
                      <>
                        <p className="rounded-xl bg-red-50 p-3 text-[11px] text-red-800 dark:bg-red-950/30 dark:text-red-300">
                          Pedido cancelado. Verifica si recibiste el abono; si se recibió, devuelve ${Number(pago.tarifa).toFixed(2)} antes de confirmar.
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
                    <p className="mt-1 text-xs text-slate-500">Se mostrarán a los clientes al solicitar un viaje o envío.</p>
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

              </div>
            </div>
            </AdminAccordion>

            )}
            {seccionAdmin === 'pagos' && (
            <AdminAccordion
              title="Historial de pagos y acciones"
              darkMode={darkMode}
              badge={historialPagosAdmin.length > 0 ? <span className="text-xs font-semibold text-slate-500">{historialPagosAdmin.length} movimientos</span> : undefined}
              defaultOpen={false}
            >
              <div className="space-y-4">
              {historialPagosAdmin.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950">Todavía no hay movimientos de pago.</p>
              ) : (
                <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                  {historialPagosAdmin.map(evento => (
                    <article key={evento.id} className={`space-y-2 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-black">{codigoPedido(evento.pedido_id)} · {etiquetaTipoServicio(evento.tipo_servicio)}</p>
                        <p className="text-[10px] text-slate-500">{new Date(evento.creado_en).toLocaleString('es-VE')}</p>
                      </div>
                      <p className="text-xs"><strong>Cliente:</strong> {evento.cliente_nombre} · <strong>Acción:</strong> {evento.accion.replaceAll('_', ' ')}</p>
                      <p className="text-xs"><strong>Actor:</strong> {evento.actor_nombre || 'Cuenta eliminada'} ({evento.actor_rol}) · <strong>Pago:</strong> {etiquetaMetodoPago(evento.metodo_pago)} / {evento.estado_pago}</p>
                      <p className="text-xs"><strong>Monto:</strong> {mostrarMontoPedido(evento.monto)}{evento.referencia_pago ? ` · Referencia: ${evento.referencia_pago}` : ''}</p>
                      <p className="text-[11px] text-slate-500">{evento.descripcion} · {evento.origen_texto} → {evento.destino_texto}</p>
                      <p className="text-[11px] text-slate-500">{evento.detalle}</p>
                    </article>
                  ))}
                </div>
              )}
              </div>
            </AdminAccordion>
            )}
            </div>
          </section>
        )}
      </main>
      {(perfilPublicoCargando || perfilPublico || errorPerfilPublico) && (
        <div className={`fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-md ${darkMode ? 'bg-slate-950/75' : 'bg-slate-900/35'}`} role="dialog" aria-modal="true" aria-labelledby="public-profile-title">
          <div className={`w-full max-w-sm space-y-4 rounded-3xl border p-6 shadow-2xl ${darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-orange-100 bg-white text-slate-900'}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="public-profile-title" className="text-lg font-black">Perfil y reputación</h2>
              <button type="button" aria-label="Cerrar perfil" onClick={() => { setPerfilPublico(null); setErrorPerfilPublico(''); }} className="rounded-xl p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <XCircle size={20} />
              </button>
            </div>
            {perfilPublicoCargando && <p className="text-sm text-slate-500">Cargando perfil…</p>}
            {errorPerfilPublico && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{errorPerfilPublico}</p>}
            {perfilPublico && (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-500/10 text-xl font-black text-[#FF5722]">
                    {perfilPublico.foto
                      ? <img src={perfilPublico.foto} alt="" className="h-full w-full object-cover" />
                      : perfilPublico.nombre.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-black">{perfilPublico.nombre}</p>
                    <p className="text-xs capitalize text-slate-500">{perfilPublico.rol}</p>
                  </div>
                </div>
                <div className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center gap-2 text-amber-500">
                    <Star size={18} fill="currentColor" />
                    <span className="text-lg font-black">
                      {perfilPublico.cantidad > 0 ? perfilPublico.promedio.toFixed(2) : 'Nuevo'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${darkMode ? 'bg-slate-700 text-slate-100' : 'bg-white text-slate-700'}`}>{perfilPublico.rango}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{perfilPublico.cantidad} {perfilPublico.cantidad === 1 ? 'calificación' : 'calificaciones'}</p>
                </div>
                {perfilPublico.rol === 'repartidor' && (
                  <div className="space-y-2 text-xs">
                    <p><strong>Vehículo:</strong> {perfilPublico.vehiculo || 'No registrado'}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {!coordsUsuarioGPS && (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-md ${darkMode ? 'bg-slate-950/85' : 'bg-slate-900/45'}`} role="dialog" aria-modal="true" aria-labelledby="location-required-title">
          <div className={`w-full max-w-sm space-y-4 rounded-3xl border p-6 shadow-2xl ${darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-orange-100 bg-white text-slate-900'}`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
              <Navigation size={27} className={ubicacionCargando ? 'animate-pulse' : ''} />
            </div>
            <div className="text-center">
              <h2 id="location-required-title" className="text-lg font-black">Ubicación necesaria</h2>
              <p className={`mt-2 text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                {errorUbicacion || 'Buscando tu ubicación actual para preparar el mapa…'}
              </p>
            </div>
            <button type="button" onClick={() => obtenerUbicacionActual()} disabled={ubicacionCargando} className="w-full rounded-xl bg-[#FF5722] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {ubicacionCargando ? 'Buscando ubicación…' : 'Reintentar ubicación'}
            </button>
            {Capacitor.isNativePlatform() ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const permisoBloqueado = errorUbicacion.toLocaleLowerCase().includes('permiso');
                    window.location.href = `llevalo://location-settings/${permisoBloqueado ? 'permission' : 'services'}`;
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-sm font-bold ${darkMode ? 'border-slate-600 text-slate-200' : 'border-slate-200 text-slate-700'}`}
                >
                  Abrir ajustes de ubicación
                </button>
                <button type="button" onClick={() => void CapacitorApp.exitApp()} className={`w-full rounded-xl border px-4 py-3 text-sm font-bold ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                  Salir de la app
                </button>
              </>
            ) : (
              <p className={`text-center text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Permite la ubicación en los ajustes de este navegador y vuelve a intentar. También puedes cerrar esta pestaña.
              </p>
            )}
          </div>
        </div>
      )}
      {estadoConexion && (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm ${darkMode ? 'bg-slate-950/75' : 'bg-slate-900/35'}`} role="dialog" aria-modal="true" aria-labelledby="offline-title">
          <div className={`w-full max-w-sm space-y-4 rounded-3xl border p-6 shadow-2xl ${darkMode ? 'border-slate-700 bg-slate-900 text-white' : 'border-orange-100 bg-white text-slate-900'}`}>
            <div className="flex items-start gap-3">
              <XCircle size={24} className={`mt-0.5 shrink-0 ${darkMode ? 'text-amber-400' : 'text-[#FF5722]'}`} />
              <div>
                <h2 id="offline-title" className="text-lg font-black">
                  {estadoConexion === 'lenta' ? 'Conexión débil' : 'Sin conexión'}
                </h2>
                <p className={`mt-1 text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  {estadoConexion === 'lenta'
                    ? 'La respuesta está tardando demasiado. Revisa tu señal de Wi-Fi o datos móviles; tus solicitudes podrían no enviarse.'
                    : 'Se perdió la conexión a internet. Reconéctate para continuar; tus solicitudes no se enviarán mientras estés sin conexión.'}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => void reintentarConexion()} disabled={probandoConexion} className="w-full rounded-xl bg-[#FF5722] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {probandoConexion ? 'Comprobando conexión…' : 'Reintentar conexión'}
            </button>
            {Capacitor.getPlatform() === 'android' ? (
              <button type="button" onClick={() => void CapacitorApp.exitApp()} className={`w-full rounded-xl border px-4 py-3 text-sm font-bold ${darkMode ? 'border-slate-600 text-slate-200' : 'border-slate-200 text-slate-700'}`}>
                Salir de la app
              </button>
            ) : (
              <p className={`text-center text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Para salir, cierra esta pestaña del navegador.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}