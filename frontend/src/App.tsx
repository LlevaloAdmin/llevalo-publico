import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Bike, MapPin, ArrowLeft, ArrowRight, Camera, User, Eye, EyeOff, Clock, Send, Power, Star, Moon, Sun, DollarSign, XCircle, Navigation, CheckCircle2, Circle, Package, CarFront, LogOut, Users, UserRound, ChevronDown, Bell, BellOff } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { registerWebPushToken } from './firebasePush';
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
  publicado_en?: string | null;
  motivo_cancelacion?: string | null;
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

const medirDistanciaMetros = (
  primera: { lat: number; lng: number },
  segunda: { lat: number; lng: number }
) => {
  const deltaLat = (primera.lat - segunda.lat) * 111_320;
  const deltaLng = (primera.lng - segunda.lng) * 111_320 * Math.cos(segunda.lat * Math.PI / 180);
  return Math.hypot(deltaLat, deltaLng);
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

interface PerfilPublico {
  id: number;
  nombre: string;
  rol: 'cliente' | 'repartidor';
  foto: string;
  vehiculo: string;
  vehiculo_foto: string;
  promedio: number;
  cantidad: number;
  rango: string;
}

interface ResumenCalificaciones {
  perfil: { promedio: number; cantidad: number; rango: string };
  pedidos: Array<{
    pedido_id: number;
    tipo_servicio: string;
    creado_en: string;
    contraparte_id: number;
    contraparte_nombre: string;
    contraparte_foto?: string;
    contraparte_vehiculo?: string;
    contraparte_vehiculo_foto?: string;
    mis_estrellas: number;
  }>;
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

type MonedaVisualizacion = 'VES' | 'EUR' | 'USDT';
type ModoBusquedaAdmin = 'codigo' | 'fecha' | 'texto';

interface ConfiguracionTarifas {
  enviosPorKm: number;
  viajesCortoPorKm: number;
  viajesLargoPorKm: number;
  tarifaMinima: number;
  monedaVisualizacion: MonedaVisualizacion;
}

interface TasasCambio {
  bolivaresPorDolar: number;
  eurosPorDolar: number;
  usdtPorDolar: number;
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

const convertirDolares = (monto: number, moneda: MonedaVisualizacion, tasas: TasasCambio) => {
  if (moneda === 'VES') return monto * tasas.bolivaresPorDolar;
  if (moneda === 'EUR') return monto * tasas.eurosPorDolar;
  return monto * tasas.usdtPorDolar;
};

const formatoMoneda = (monto: number, moneda: MonedaVisualizacion) => {
  const formatted = monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (moneda === 'VES') return `Bs. ${formatted}`;
  if (moneda === 'EUR') return `€${formatted}`;
  return `${formatted} USDT`;
};

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
  description: string;
  darkMode: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

function AdminAccordion({ title, description, darkMode, badge, children }: AdminAccordionProps) {
  return (
    <details className={`admin-accordion rounded-3xl border shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <div className="min-w-0">
          <h3 className="text-base font-black">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
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
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const historialNavegacionRef = useRef<Tab[]>([]);
  const [serviceType, setServiceType] = useState<TipoServicio>('envios');
  
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('llevalo_dark_mode') === 'true');
  const [estadoConexion, setEstadoConexion] = useState<'sin-internet' | 'lenta' | null>(
    () => typeof navigator !== 'undefined' && !navigator.onLine ? 'sin-internet' : null
  );
  const [probandoConexion, setProbandoConexion] = useState(false);
  const fallosConexionRef = useRef(0);
  const medicionesLentasRef = useRef(0);

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
  const [authMode, setAuthMode] = useState<'choice' | 'login' | 'register'>('choice');
  const [authRoleSelection, setAuthRoleSelection] = useState<'cliente' | 'repartidor'>('cliente');
  const [errorAuth, setErrorAuth] = useState('');
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
  const [rumboUsuario, setRumboUsuario] = useState<number | null>(null);
  const disponiblePushRepartidor = repartidorOnline && Boolean(coordsUsuarioGPS);
  const disponiblePushRepartidorRef = useRef(disponiblePushRepartidor);
  useEffect(() => {
    disponiblePushRepartidorRef.current = disponiblePushRepartidor;
  }, [disponiblePushRepartidor]);
  const [recentrarMapa, setRecentrarMapa] = useState(0);
  const objetivoUbicacionRef = useRef<'origen' | 'destino' | null>(null);

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
  const [distanciaKm, setDistanciaKm] = useState<number>(0);
  const [tiempoEstimadoMin, setTiempoEstimadoMin] = useState<number>(0);
  
  const rutaCompletaLista = Boolean(coordsOrigen && coordsDestino && origenInput.trim() && destinoInput.trim());
  const esperandoNombreDireccion = [origenInput, destinoInput]
    .some(input => /^Buscando (sector cercano|lugar)/i.test(input));

  const [configuracionTarifas, setConfiguracionTarifas] = useState<ConfiguracionTarifas | null>(null);
  const [tasasCambio, setTasasCambio] = useState<TasasCambio | null>(null);
  const [cargandoTarifas, setCargandoTarifas] = useState(false);
  const [errorTarifas, setErrorTarifas] = useState('');
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
    viajesCortoPorKm: 0.38,
    viajesLargoPorKm: 0.28,
    tarifaMinima: 1.5,
    monedaVisualizacion: 'VES'
  });

  const costoPorKm = serviceType === 'viajes'
    ? (distanciaKm >= 1
      ? configuracionTarifas?.viajesLargoPorKm ?? 0.28
      : configuracionTarifas?.viajesCortoPorKm ?? 0.38)
    : configuracionTarifas?.enviosPorKm ?? 0.5;
  const tarifaTotal = rutaCompletaLista
    ? Math.max(configuracionTarifas?.tarifaMinima ?? 1.5, distanciaKm * costoPorKm).toFixed(2)
    : '0.00';
  const tarifaUsd = Number(tarifaTotal);
  const tarifaEnMonedaSeleccionada = configuracionTarifas && tasasCambio
    ? formatoMoneda(convertirDolares(tarifaUsd, configuracionTarifas.monedaVisualizacion, tasasCambio), configuracionTarifas.monedaVisualizacion)
    : null;
  const tarifaEnBolivares = tasasCambio
    ? formatoMoneda(convertirDolares(tarifaUsd, 'VES', tasasCambio), 'VES')
    : null;
  const mostrarMontoPedido = (monto: string | number) => {
    const montoUsd = Number(monto);
    if (!Number.isFinite(montoUsd)) return 'Monto no disponible';
    const baseUsd = `$${montoUsd.toFixed(2)} USD`;
    if (!configuracionTarifas || !tasasCambio) return baseUsd;
    const equivalente = formatoMoneda(
      convertirDolares(montoUsd, configuracionTarifas.monedaVisualizacion, tasasCambio),
      configuracionTarifas.monedaVisualizacion
    );
    return `${equivalente} aprox. · ${baseUsd}`;
  };

  const [pedidosReales, setPedidosReales] = useState<PedidoReal[]>([]);
  const [postulacionesReales, setPostulacionesReales] = useState<Postulacion[]>([]);
  const [mensajesChat, setMensajesChat] = useState<MensajeChat[]>([]);
  const [resumenCalificaciones, setResumenCalificaciones] = useState<ResumenCalificaciones | null>(null);
  const [estrellasSeleccionadas, setEstrellasSeleccionadas] = useState<Record<number, number>>({});
  const [calificandoPedidoId, setCalificandoPedidoId] = useState<number | null>(null);
  const [perfilPublico, setPerfilPublico] = useState<PerfilPublico | null>(null);
  const [perfilPublicoCargando, setPerfilPublicoCargando] = useState(false);
  const [errorPerfilPublico, setErrorPerfilPublico] = useState('');
  const [nuevoMensajeTexto, setNuevoMensajeTexto] = useState('');
  const [metodoPagoViaje, setMetodoPagoViaje] = useState<MetodoPagoViaje>('pago_movil');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [configuracionPago, setConfiguracionPago] = useState<ConfiguracionPago | null>(null);
  const [cargandoConfiguracionPago, setCargandoConfiguracionPago] = useState(false);
  const [errorPago, setErrorPago] = useState('');
  const [pagosPendientesAdmin, setPagosPendientesAdmin] = useState<PedidoReal[]>([]);
  const [historialPagosAdmin, setHistorialPagosAdmin] = useState<HistorialPagoAdmin[]>([]);
  const [metricasAdmin, setMetricasAdmin] = useState<MetricasAdmin | null>(null);
  const [actividadAdmin, setActividadAdmin] = useState<ActividadAdmin[]>([]);
  const [cargandoAdmin, setCargandoAdmin] = useState(false);
  const [errorAdmin, setErrorAdmin] = useState('');
  const [mensajeAdmin, setMensajeAdmin] = useState('');
  const [configPagoAdmin, setConfigPagoAdmin] = useState({ banco: '', telefono: '', cedula: '', titular: '' });
  const [emailRecargaSaldo, setEmailRecargaSaldo] = useState('');
  const [montoRecargaSaldo, setMontoRecargaSaldo] = useState('');
  const [notaRecargaSaldo, setNotaRecargaSaldo] = useState('');

  const [horaActual, setHoraActual] = useState(horaInicial);
  const usuarioId = usuario?.id;

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

  const toggleDarkMode = () => {
    const nuevo = !darkMode;
    setDarkMode(nuevo);
    localStorage.setItem('llevalo_dark_mode', String(nuevo));
    if (Capacitor.isNativePlatform()) window.location.href = `llevalo://theme/${nuevo ? 'dark' : 'light'}`;
  };

  const sincronizarDatos = async () => {
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
        setPedidosCargadosUsuarioId(null);
        snapshotAvisosRepartidorRef.current = null;
        ultimoBloqueTemporizadorRef.current.clear();
        setFotoLocal('');
        setCedulaNumero('');
        historialNavegacionRef.current = [];
        setActiveTab('home');
      }
    } catch (e) { console.error('Error sincronizando:', e); }
  };

  useEffect(() => {
    if (!usuario) return;
    // Apply polling results after the request completes, not during the effect's render.
    // oxlint-disable-next-line react/set-state-in-effect
    sincronizarDatos();
    const intervalo = setInterval(sincronizarDatos, 3000);
    return () => clearInterval(intervalo);
  }, [repartidorOnline, usuario]);

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

  const manejarClicEnMapa = async (lat: number, lng: number) => {
    if (!modoSeleccionMapa) return;
    geocodificacionGPSRef.current?.abort();
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
    } else {
      setCoordsDestino({ lat, lng });
      setDestinoInput('Buscando lugar...');
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
    if (typeof DeviceOrientationEvent !== 'undefined') {
      const orientationApi = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (orientationApi.requestPermission) {
        void orientationApi.requestPermission().catch(error => {
          console.error('No se pudo activar la brújula del dispositivo:', error);
        });
      }
    }
    geocodificacionGPSRef.current?.abort();
    objetivoUbicacionRef.current = objetivo;
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

    setUbicacionCargando(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
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
              const params = new URLSearchParams({
                lat: String(ubicacion.lat),
                lon: String(ubicacion.lng),
                radius: '0.5',
                limit: '1'
              });
              const response = await fetch(`https://photon.komoot.io/reverse?${params}`, { signal: controller.signal });
              if (!response.ok) throw new Error(`Photon respondió HTTP ${response.status}`);
              const data = await response.json();
              const properties = data?.features?.[0]?.properties as PropiedadesPhoton | undefined;
              const direccion = properties ? formatearDireccionPhoton(properties) : '';
              const nombre = direccion || 'Sector cercano no identificado';
              if (objetivoActual === 'origen') setOrigenInput(nombre);
              else setDestinoInput(nombre);
            } catch (error) {
              if (error instanceof DOMException && error.name === 'AbortError') return;
              console.error('No se pudo identificar el sector cercano a la ubicación:', error);
              setErrorGeocoding('No se pudo identificar el sector cercano; conservamos las coordenadas del GPS.');
              if (objetivoActual === 'origen') setOrigenInput('Ubicación actual · sector cercano no disponible');
              else setDestinoInput('Ubicación actual · sector cercano no disponible');
            }
          })();
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          coordsUsuarioGPSRef.current = null;
          setCoordsUsuarioGPS(null);
        }
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
    geocodificacionGPSRef.current?.abort();
    const setInput = tipo === 'origen' ? setOrigenInput : setDestinoInput;
    const setCoords = tipo === 'origen' ? setCoordsOrigen : setCoordsDestino;
    const setSugerencias = tipo === 'origen' ? setSugerenciasOrigen : setSugerenciasDestino;
    setInput(query);
    setCoords(null);
    setSugerencias([]);
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
    geocodificacionGPSRef.current?.abort();
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
      setSugerenciasOrigen([]);
    } else {
      setDestinoInput(item.display_name);
      setCoordsDestino({ lat: item.lat, lng: item.lon });
      setSugerenciasDestino([]);
    }
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
    navegarA('cliente');
    void cargarConfiguracionPago();
    void cargarTarifas();
  };

  const cargarPanelAdmin = async () => {
    if (!usuario?.es_admin) return;
    setCargandoAdmin(true);
    setErrorAdmin('');
    try {
      const [pagosResponse, configResponse, historialResponse, tarifasResponse] = await Promise.all([
        authenticatedFetch(`${API_URL}/api/pagos/admin/pendientes`),
        authenticatedFetch(`${API_URL}/api/pagos/config`),
        authenticatedFetch(`${API_URL}/api/pagos/admin/historial`),
        authenticatedFetch(`${API_URL}/api/pagos/tarifas`)
      ]);
      if (!pagosResponse.ok) throw new Error(await mensajeErrorApi(pagosResponse, 'No se pudieron cargar los pagos pendientes'));
      if (!configResponse.ok) throw new Error(await mensajeErrorApi(configResponse, 'No se pudo cargar la configuración de pago'));
      if (!historialResponse.ok) throw new Error(await mensajeErrorApi(historialResponse, 'No se pudo cargar el historial de pagos'));
      if (!tarifasResponse.ok) throw new Error(await mensajeErrorApi(tarifasResponse, 'No se pudieron cargar las tarifas'));
      const pagosData = await pagosResponse.json();
      const configData: ConfiguracionPago = await configResponse.json();
      const historialData = await historialResponse.json();
      const tarifasData: { tarifas: ConfiguracionTarifas; tasas: TasasCambio | null; errorTasas?: string } = await tarifasResponse.json();
      setPagosPendientesAdmin(Array.isArray(pagosData.pagos) ? pagosData.pagos : []);
      setHistorialPagosAdmin(Array.isArray(historialData.historial) ? historialData.historial : []);
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
      navegarA(rol);
      setMensajeAdmin(`Perspectiva de ${rol} activada.`);
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
      setMensajeAdmin('Tarifas y moneda de visualización actualizadas para todas las cuentas.');
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

  const recargarSaldoCorporativo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!window.confirm(`¿Confirmas que verificaste el abono de $${Number(montoRecargaSaldo).toFixed(2)} USD para ${emailRecargaSaldo.trim()}?`)) return;
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
      setMensajeAdmin(`Saldo acreditado. Nuevo saldo base: $${Number(data.saldoCorporativo).toFixed(2)}.`);
    } catch (error) {
      setErrorAdmin(error instanceof Error ? error.message : 'No se pudo recargar el saldo.');
    }
  };

  const handleCrearPedido = async () => {
    if (!usuario) return;
    if (!configuracionTarifas) {
      alert(errorTarifas || 'Espera a que se carguen las tarifas y tasas actuales.');
      void cargarTarifas();
      return;
    }
    if (metodoPagoViaje === 'pago_movil' && !tasasCambio) {
      alert(errorTarifas || 'Pago Móvil requiere que la tasa oficial de bolívares esté disponible.');
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
      alert('Pago Móvil todavía no está configurado por Llévalo. Selecciona otro método o inténtalo luego.');
      return;
    }
    if (metodoPagoViaje === 'saldo_corporativo'
      && (configuracionPago?.saldoCorporativo || 0) < Number(tarifaTotal)) {
      alert('Tu saldo corporativo no es suficiente para este pedido.');
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
          cliente_cedula: usuario.cedula || 'V-00000000',
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repartidor_id: usuario.id, repartidor_nombre: usuario.nombre,
          vehiculo: usuario.vehiculo || 'Moto Suzuki GN', placa: usuario.placa || 'ABC-123',
          vehiculo_foto: fotoVehiculoLocal || usuario.vehiculo_foto || '', calificacion: usuario.calificacion || 4.9
        })
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
    let descartado = false;
    let notificacionesSolicitadas = false;
    let ubicacionPendiente = false;
    const pedirNotificaciones = () => {
      if (notificacionesSolicitadas) return;
      notificacionesSolicitadas = true;
      void requestAppNotificationPermission().catch(error => {
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
    if (activeTab !== 'cliente' && activeTab !== 'repartidor') return;
    const handleOrientation = (event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const heading = typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)
        ? event.webkitCompassHeading
        : event.alpha === null ? null : (360 - event.alpha + 360) % 360;
      if (heading !== null && Number.isFinite(heading)) {
        setRumboUsuario(Math.round(heading) % 360);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, [activeTab]);

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
      if (data.type !== 'driver-notification-action' || typeof data.action !== 'string') return;
      const orderId = typeof data.orderId === 'number' && Number.isSafeInteger(data.orderId)
        ? data.orderId
        : null;
      void manejarAccionAvisoRef.current(data.action, orderId);
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
    if (authMode === 'register' && !/^\d{5,10}$/.test(cedulaNumero.trim())) {
      setErrorAuth('Ingresa una cédula válida de 5 a 10 dígitos.');
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
          cedula: cedulaCompleta, foto: fotoLocal,
          vehiculo: tipoVehiculo, placa: placaVehiculo || 'ABC-123', 
          vehiculo_foto: fotoVehiculoLocal, calificacion: 4.9,
          password, rol: authRoleSelection 
        };

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      assertApiConfigured();
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
      historialNavegacionRef.current = [];
      setActiveTab('home');
    } catch (err: any) {
      setErrorAuth(err.message);
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
      navegarA(usuario.rol === 'cliente' ? 'cliente' : 'repartidor');
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
    const tokenPush = usuario?.rol === 'repartidor'
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
      return;
    }
    let descartado = false;
    void authenticatedFetch(`${API_URL}/api/reviews/summary`)
      .then(async response => {
        if (!response.ok) throw new Error(await mensajeErrorApi(response, 'No se pudieron cargar las calificaciones'));
        return response.json() as Promise<ResumenCalificaciones>;
      })
      .then(resumen => {
        if (!descartado) setResumenCalificaciones(resumen);
      })
      .catch(error => {
        if (!descartado) console.error('No se pudo cargar el resumen de calificaciones:', error);
      });
    return () => { descartado = true; };
  }, [usuario, pedidosCompletadosKey]);

  useEffect(() => {
    if (usuario?.rol !== 'repartidor') return;
    Promise.resolve().then(() => {
      setAvisosRepartidorActivos(localStorage.getItem(`llevalo_driver_notifications_${usuario.id}`) === 'true');
      setRepartidorOnline(localStorage.getItem(`llevalo_driver_online_${usuario.id}`) === 'true');
    });
    void getDriverNotificationPermission()
      .then(setPermisoAvisosRepartidor)
      .catch(error => {
        console.error('No se pudo consultar el permiso de notificaciones:', error);
        setPermisoAvisosRepartidor('unsupported');
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
          await retirarTokenPush(token);
          localStorage.removeItem(`llevalo_push_token_${usuario.id}`);
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
    void manejarAccionAvisoRef.current(action, orderId);
  }, [usuario]);

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
  const pagoPedidoCompleto = metodoPagoViaje === 'efectivo'
    || (metodoPagoViaje === 'pago_movil'
      && Boolean(configuracionPago?.pagoMovil.banco
        && configuracionPago.pagoMovil.telefono
        && configuracionPago.pagoMovil.cedula
        && configuracionPago.pagoMovil.titular)
      && /^\d{1,100}$/.test(referenciaPago.trim()))
    || (metodoPagoViaje === 'saldo_corporativo'
      && (configuracionPago?.saldoCorporativo || 0) >= Number(tarifaTotal));

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
  }, [coordsUsuarioGPS, pedidoAsignadoRepartidor, usuario?.rol]);

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
    <div className={`app-shell flex flex-col font-sans transition-colors duration-300 ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#FDFBF7] text-slate-800'}`}>
      <header className={`border-b backdrop-blur sticky top-0 z-50 px-4 md:px-10 py-3 flex flex-wrap justify-between items-center gap-y-2 shadow-sm transition-colors ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-[#FDFBF7]/90 border-orange-100'}`}>
        {usuario ? (
          <div className="flex items-center space-x-3" aria-label="Llévalo">
            <div className="bg-[#FF5722] text-white w-9 h-9 rounded-2xl font-black text-lg flex items-center justify-center shadow-md">L</div>
            <span className={`text-xl md:text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Llévalo</span>
          </div>
        ) : (
          <button type="button" onClick={() => navegarA('home')} className="flex items-center space-x-3" aria-label="Volver al inicio">
            <div className="bg-[#FF5722] text-white w-9 h-9 rounded-2xl font-black text-lg flex items-center justify-center shadow-md">L</div>
            <span className={`text-xl md:text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Llévalo</span>
          </button>
        )}
        
        <nav className={`hidden md:flex space-x-2 p-1.5 rounded-2xl border ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-orange-50/80 border-orange-100'}`}>
          <button onClick={() => navegarA('home')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'home' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>{usuario ? 'Mi Panel' : 'Inicio'}</button>
          {usuario && usuario.rol === 'cliente' && <button onClick={irAPedidos} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'cliente' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Pedir</button>}
          {usuario && usuario.rol === 'repartidor' && <button onClick={() => navegarA('repartidor')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'repartidor' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Radar de Trabajos</button>}
          {usuario?.es_admin && <button onClick={() => { navegarA('admin'); void cargarPanelAdmin(); }} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'admin' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Administración</button>}
        </nav>

        <div className="flex items-center space-x-2 md:space-x-3">
          {usuario ? (
            <>
              {tasasCambio && (
                <span title="Tasa oficial del dólar en bolívares" className={`inline-flex flex-col rounded-xl border px-2.5 py-1.5 text-[10px] font-bold leading-tight sm:px-3.5 sm:text-xs ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-orange-100 bg-white text-slate-700'}`}>
                  <span className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Dólar oficial</span>
                  <span>{formatoMoneda(tasasCambio.bolivaresPorDolar, 'VES')}</span>
                </span>
              )}
              <button
                type="button"
                aria-label="Abrir perfil"
                onClick={() => navegarA('perfil')}
                className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 shadow-sm transition hover:scale-105 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-orange-200 bg-orange-50'}`}
              >
                {fotoLocal ? (
                  <img src={fotoLocal} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-[#FF5722]">
                    {usuario.nombre ? usuario.nombre.substring(0, 2).toUpperCase() : 'U'}
                  </span>
                )}
              </button>
            </>
          ) : (
            <button onClick={() => { setErrorAuth(''); setAuthMode('choice'); navegarA('auth'); }} className={`flex items-center space-x-1.5 border px-4 py-2 rounded-2xl transition text-xs md:text-sm font-bold shadow-sm cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800' : 'bg-white hover:bg-orange-50 border-orange-200 text-slate-800'}`}>
              <User size={16} className="text-[#FF5722]" />
              <span>Ingresar</span>
            </button>
          )}
        </div>

        {usuario && (
          <nav aria-label="Navegación móvil" className={`flex w-full flex-wrap items-center gap-2 md:hidden ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
            <button type="button" aria-pressed={activeTab === 'home'} onClick={() => navegarA('home')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'home' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
              <MapPin size={17} /> Inicio
            </button>
            {usuario.rol === 'cliente' ? (
              <button type="button" aria-pressed={activeTab === 'cliente'} onClick={irAPedidos} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'cliente' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <Package size={17} /> Pedir
              </button>
            ) : (
              <button type="button" aria-pressed={activeTab === 'repartidor'} onClick={() => navegarA('repartidor')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'repartidor' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <Bike size={17} /> Radar
              </button>
            )}
            {usuario.es_admin && (
              <button type="button" aria-pressed={activeTab === 'admin'} onClick={() => { navegarA('admin'); void cargarPanelAdmin(); }} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'admin' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
                <DollarSign size={17} /> Admin
              </button>
            )}
            <button type="button" aria-pressed={activeTab === 'perfil'} onClick={() => navegarA('perfil')} className={`flex min-w-[5rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${activeTab === 'perfil' ? 'border-orange-200 bg-orange-50 text-[#FF5722]' : 'border-transparent'}`}>
              <User size={17} /> Perfil
            </button>
          </nav>
        )}
      </header>

      <main className="app-page flex-1 flex flex-col p-4 md:p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'home' && !usuario && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-8 lg:py-14">
              <div className="space-y-6">
                <div className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase border ${darkMode ? 'bg-orange-950/60 border-orange-900 text-orange-300' : 'bg-orange-100 border-orange-200 text-[#FF5722]'}`}>
                  <MapPin size={14} className="text-[#FF5722]" />
                  <span>Carabobo, Venezuela 🇻🇪</span>
                </div>
                <h1 className={`text-4xl lg:text-7xl font-black tracking-tight leading-[1.08] ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Lo que necesites, <span className="text-[#FF5722]">llévalo ya.</span>
                </h1>
                <p className={`text-base lg:text-lg leading-relaxed max-w-xl ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Envíos y viajes en San Diego. Conoce quién realizará el servicio y sigue cada solicitud desde la app.
                </p>

                <div className="pt-2">
                  <button onClick={() => { setAuthMode('choice'); setAuthRoleSelection('cliente'); navegarA('auth'); }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF5722] px-8 py-4 font-bold text-white shadow-lg transition hover:bg-[#F4511E] cursor-pointer sm:w-fit">
                    <span>Empezar aquí</span>
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className={`rounded-3xl overflow-hidden shadow-xl border p-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-orange-100 border-orange-200'}`}>
                  <img src="/hero-moto.jpg" alt="Repartidor de Llévalo en moto" className="rounded-2xl object-cover w-full h-[420px]" />
                </div>
              </div>
            </div>

            <section className="mx-auto w-full max-w-6xl space-y-5 pb-10">
              <div className="max-w-2xl">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF5722]">A tu ritmo, desde un solo lugar</p>
                <h2 className={`mt-2 text-2xl font-black md:text-3xl ${darkMode ? 'text-white' : 'text-slate-900'}`}>Resuelve más con Llévalo</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { icon: Package, title: 'Envíos y mandados', description: 'Comida, mercado y encargos para tu día a día.' },
                  { icon: CarFront, title: 'Viajes en la ciudad', description: 'Solicita un traslado y conoce el estado del servicio.' },
                  { icon: Navigation, title: 'Seguimiento sencillo', description: 'Consulta el avance de tu solicitud desde la app.' }
                ].map(({ icon: Icon, title, description }) => (
                  <article key={title} className={`rounded-2xl border p-5 transition-colors ${darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-orange-100 bg-white'}`}>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-[#FF5722]"><Icon size={20} /></div>
                    <h3 className={`mt-4 font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                    <p className={`mt-2 text-sm leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{description}</p>
                  </article>
                ))}
              </div>
              <div className={`flex flex-col gap-3 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${darkMode ? 'border-slate-800 bg-slate-900/70 text-slate-300' : 'border-orange-100 bg-white text-slate-600'}`}>
                <span><strong className={darkMode ? 'text-white' : 'text-slate-900'}>Así de fácil:</strong> crea tu cuenta, indica qué necesitas y sigue el servicio.</span>
                <button type="button" onClick={() => { setAuthMode('choice'); setAuthRoleSelection('cliente'); navegarA('auth'); }} className="inline-flex shrink-0 items-center gap-2 font-bold text-[#FF5722]">
                  Crear cuenta <ArrowRight size={16} />
                </button>
              </div>
            </section>
          </>
        )}

        {activeTab === 'home' && usuario && (
          <section className="w-full max-w-5xl mx-auto py-6 md:py-12 space-y-6">
            <div className={`rounded-3xl p-6 md:p-10 border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
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
              <div className="grid gap-4 md:grid-cols-3">
                <button onClick={() => { setServiceType('envios'); irAPedidos(); }} className={`rounded-3xl border p-6 text-left transition hover:-translate-y-0.5 ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-orange-700' : 'bg-white border-orange-100 hover:border-orange-300'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-[#FF5722]"><Package size={20} /></div>
                  <h2 className="font-black">Pedir un envío</h2>
                  <p className="mt-2 text-xs text-slate-500">Comida, mercado, mandados y más.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#FF5722]">Continuar <ArrowRight size={14} /></span>
                </button>
                <button onClick={() => { setServiceType('viajes'); irAPedidos(); }} className={`rounded-3xl border p-6 text-left transition hover:-translate-y-0.5 ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-orange-700' : 'bg-white border-orange-100 hover:border-orange-300'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CarFront size={20} /></div>
                  <h2 className="font-black">Pedir un viaje</h2>
                  <p className="mt-2 text-xs text-slate-500">Indica tu origen y destino para ver el costo.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#FF5722]">Continuar <ArrowRight size={14} /></span>
                </button>
                <div className={`rounded-3xl border p-6 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Clock size={20} /></div>
                  <h2 className="font-black">Tu servicio</h2>
                  <p className="mt-2 text-xs text-slate-500">
                    {pedidoActivoCliente
                      ? `Pedido ${pedidoActivoCliente.estado}: ${pedidoActivoCliente.descripcion}`
                      : pedidoExpiradoReciente
                        ? pedidoExpiradoReciente.motivo_cancelacion === 'sin_repartidor'
                          ? 'Tu solicitud se canceló automáticamente porque ningún repartidor se postuló en 60 segundos. Puedes crear una nueva.'
                          : 'El repartidor canceló esta solicitud antes de iniciar el servicio. Puedes crear una nueva.'
                        : 'Todavía no tienes pedidos activos. Cuando hagas uno, su estado aparecerá aquí.'}
                  </p>
                  {pedidoActivoCliente && <button onClick={irAPedidos} className="mt-4 text-xs font-bold text-[#FF5722] hover:underline">Ver pedido y seguimiento</button>}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
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

            <div className="grid gap-3 sm:grid-cols-3">
              {usuario.rol === 'cliente' ? (
                <>
                  <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-orange-100 bg-white'}`}>
                    <Package size={18} className="text-[#FF5722]" />
                    <h3 className="mt-3 text-sm font-bold">Envíos y viajes</h3>
                    <p className="mt-1 text-xs text-slate-500">Comida, mercado, mandados o traslados en un solo lugar.</p>
                  </article>
                  <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-orange-100 bg-white'}`}>
                    <MapPin size={18} className="text-emerald-500" />
                    <h3 className="mt-3 text-sm font-bold">Seguimiento claro</h3>
                    <p className="mt-1 text-xs text-slate-500">Revisa el estado de tu solicitud y el recorrido del repartidor.</p>
                  </article>
                  <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-orange-100 bg-white'}`}>
                    <DollarSign size={18} className="text-amber-500" />
                    <h3 className="mt-3 text-sm font-bold">Pagos transparentes</h3>
                    <p className="mt-1 text-xs text-slate-500">Consulta el método elegido y el estado del pago en cada pedido.</p>
                  </article>
                </>
              ) : (
                <>
                  <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-orange-100 bg-white'}`}>
                    <Package size={18} className="text-[#FF5722]" />
                    <h3 className="mt-3 text-sm font-bold">Trabajos cerca</h3>
                    <p className="mt-1 text-xs text-slate-500">Explora solicitudes disponibles y elige las que te convengan.</p>
                  </article>
                  <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-orange-100 bg-white'}`}>
                    <MapPin size={18} className="text-emerald-500" />
                    <h3 className="mt-3 text-sm font-bold">Ruta guiada</h3>
                    <p className="mt-1 text-xs text-slate-500">Usa el mapa para llegar al origen y al destino del servicio.</p>
                  </article>
                  <article className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-orange-100 bg-white'}`}>
                    <Clock size={18} className="text-amber-500" />
                    <h3 className="mt-3 text-sm font-bold">Tu ritmo</h3>
                    <p className="mt-1 text-xs text-slate-500">Controla tu disponibilidad y las postulaciones desde el radar.</p>
                  </article>
                </>
              )}
            </div>
          </section>
        )}

        {activeTab === 'auth' && (
          <div className="max-w-md mx-auto w-full py-8">
            <div className={`border p-6 md:p-8 rounded-3xl shadow-sm space-y-6 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
              <button
                type="button"
                onClick={() => authMode === 'choice' ? navegarA('home') : setAuthMode('choice')}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-orange-50'}`}
              >
                <ArrowLeft size={15} /> {authMode === 'choice' ? 'Volver al inicio' : 'Volver a opciones'}
              </button>
              <div className="text-center space-y-1">
                <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {authMode === 'choice' ? 'Bienvenido a Llévalo' : authMode === 'login' ? '¡Bienvenido de nuevo!' : 'Crea tu cuenta'}
                </h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {authMode === 'choice' ? 'Elige cómo quieres continuar' : 'Accede a Llévalo en Carabobo'}
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
              ) : (
                <>
              {authMode === 'register' && (
                <div className={`flex p-1 rounded-2xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-100'}`}>
                  <button type="button" onClick={() => setAuthRoleSelection('cliente')} className={`flex-1 py-2 text-xs font-bold rounded-xl cursor-pointer ${authRoleSelection === 'cliente' ? 'bg-[#FF5722] text-white' : (darkMode ? 'text-slate-400' : 'text-slate-600')}`}>Cliente</button>
                  <button type="button" onClick={() => setAuthRoleSelection('repartidor')} className={`flex-1 py-2 text-xs font-bold rounded-xl cursor-pointer ${authRoleSelection === 'repartidor' ? 'bg-[#FF5722] text-white' : (darkMode ? 'text-slate-400' : 'text-slate-600')}`}>Repartidor</button>
                </div>
              )}

              {errorAuth && <div role="alert" className={`rounded-xl border p-3 text-xs font-bold ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorAuth}</div>}

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
                        <input type="text" required inputMode="numeric" minLength={5} value={cedulaNumero} onChange={e => setCedulaNumero(e.target.value.replace(/\D/g, ''))} placeholder="28123456" maxLength={10} className={`w-full border rounded-r-xl px-4 py-2 text-sm ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
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
                    <input type={mostrarPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={`w-full border rounded-xl px-4 py-2 text-sm pr-12 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    <button type="button" aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={mostrarPassword} onClick={() => setMostrarPassword(!mostrarPassword)} className="password-toggle absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-4 items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className={`border p-6 rounded-3xl shadow-sm space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
                <div className="flex justify-between items-center">
                  <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Nuevo Pedido</h3>
                </div>

                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                  <button type="button" onClick={() => { setServiceType('envios'); void cargarConfiguracionPago(); }} className={`rounded-2xl border p-4 text-left transition cursor-pointer ${serviceType === 'envios' ? 'border-[#FF5722] bg-orange-50 shadow-sm dark:bg-orange-950/30' : 'border-slate-200 bg-white hover:border-orange-200 dark:border-slate-800 dark:bg-slate-950'}`}>
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
                                <p className="text-[10px] text-slate-500">{post.vehiculo} · Placa: {post.placa}</p>
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
                              <p className="text-[10px] text-slate-500">{pedidoActivoCliente.repartidor_vehiculo} · Placa: {pedidoActivoCliente.repartidor_placa}</p>
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
                        <p className="mt-1 text-[10px] text-slate-500">¿No aparece el lugar o establecimiento? Toca “Mapa” para marcar el punto exacto.</p>
                      )}
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
                        <p className="mt-1 text-[10px] text-slate-500">¿No aparece el lugar o establecimiento? Toca “Mapa” para marcar el punto exacto.</p>
                      )}
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
                          <p className="text-sm font-black text-[#FF5722]">{tarifaEnMonedaSeleccionada || `$${tarifaTotal}`}</p>
                          <p className="text-[10px] text-slate-400">Base: ${tarifaTotal} USD</p>
                          {tarifaEnBolivares && metodoPagoViaje === 'pago_movil' && (
                            <p className="text-[10px] text-slate-400">Pago Móvil: {tarifaEnBolivares}</p>
                          )}
                        </div>
                      </div>
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
                                <p className="pt-1 text-[10px] text-amber-700 dark:text-amber-400">Realiza el pago por el monto cotizado y escribe la referencia. Un administrador la verificará antes de ofrecer el pedido en el radar.</p>
                              </div>
                            ) : !cargandoConfiguracionPago && (
                              <p className="text-amber-700 dark:text-amber-400">Pago Móvil aún no está configurado. Puedes elegir efectivo o saldo corporativo.</p>
                            )}
                            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={100} value={referenciaPago} onChange={e => setReferenciaPago(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Referencia numérica de la operación" className={`w-full rounded-xl border px-3 py-2 ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`} />
                          </div>
                        )}

                        {metodoPagoViaje === 'efectivo' && (
                          <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                            {serviceType === 'viajes'
                              ? 'Paga al conductor en el punto de partida. El conductor confirmará que recibió el efectivo antes de iniciar el viaje.'
                              : 'Paga al repartidor al retirar el envío en el punto de origen. El repartidor confirmará que recibió el efectivo.'}
                          </p>
                        )}

                        {metodoPagoViaje === 'saldo_corporativo' && (
                          <p className={`rounded-xl p-3 text-[11px] ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                            Saldo disponible: <strong>${(configuracionPago?.saldoCorporativo || 0).toFixed(2)}</strong>
                            <span className="mt-1 block">Se descontará al solicitar y se devolverá si cancelas antes de que un repartidor acepte.</span>
                            {(configuracionPago?.saldoCorporativo || 0) < Number(tarifaTotal) && <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-400">Solicita una recarga al administrador de tu cuenta.</span>}
                          </p>
                        )}
                        {errorPago && <p role="alert" className="text-[10px] font-semibold text-red-600">{errorPago}</p>}
                      </div>

                    <button disabled={!rutaCompletaLista || esperandoNombreDireccion || distanciaKm <= 0 || tiempoEstimadoMin <= 0 || !pagoPedidoCompleto || enviandoPedido || cargandoTarifas || !configuracionTarifas || (metodoPagoViaje === 'pago_movil' && !tasasCambio)} onClick={handleCrearPedido} className={`w-full py-3 rounded-xl font-bold text-xs transition cursor-pointer shadow-md ${!rutaCompletaLista || esperandoNombreDireccion || distanciaKm <= 0 || tiempoEstimadoMin <= 0 || !pagoPedidoCompleto || enviandoPedido || cargandoTarifas || !configuracionTarifas || (metodoPagoViaje === 'pago_movil' && !tasasCambio) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white'}`}>
                      {cargandoTarifas ? 'Actualizando tarifas…' : enviandoPedido ? 'Procesando…' : metodoPagoViaje === 'saldo_corporativo' ? 'Pagar con saldo y solicitar' : serviceType === 'viajes' ? 'Solicitar viaje' : 'Publicar envío en radar'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="relative lg:col-span-7 h-[min(60dvh,520px)] min-h-[300px] lg:h-[calc(100dvh-140px)] rounded-3xl overflow-hidden border shadow-sm sticky top-20">
              <button type="button" onClick={() => obtenerUbicacionActual()} disabled={ubicacionCargando} className={`absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-md disabled:opacity-60 ${darkMode ? 'border-slate-600 bg-slate-800/95 text-slate-100' : 'border-white/80 bg-white/95 text-slate-800'}`}>
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
                  rumboUsuario={rumboUsuario}
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
          </div>
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

              <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg p-2 ${avisosRepartidorActivos ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-500/10 text-[#FF5722]'}`}>
                    {avisosRepartidorActivos ? <Bell size={16} /> : <BellOff size={16} />}
                  </span>
                  <div>
                    <p className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>Notificaciones</p>
                    <p className="text-[10px] text-slate-500">
                      {avisosRepartidorActivos ? 'Avisos de trabajos activados' : 'Avisos desactivados'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void cambiarAvisosRepartidor()}
                  className={`rounded-xl px-3 py-2 text-[11px] font-bold transition ${
                    avisosRepartidorActivos
                      ? 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'bg-[#FF5722] text-white hover:bg-[#F4511E]'
                  }`}
                >
                  {avisosRepartidorActivos ? 'Silenciar' : 'Activar avisos'}
                </button>
                <div className="ml-auto flex items-center gap-4 text-[11px]">
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
                  <MapaLibre
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
                    rumboUsuario={rumboUsuario}
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

              {resumenCalificaciones && (
                <section className={`border-b p-5 md:px-8 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`} aria-labelledby="rating-history-title">
                  <div className="mb-4">
                    <h3 id="rating-history-title" className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Calificaciones de pedidos</h3>
                    <p className="mt-1 text-xs text-slate-500">Después de completar un pedido, ambas personas pueden dejar una calificación.</p>
                  </div>
                  {resumenCalificaciones.pedidos.length === 0 ? (
                    <p className={`rounded-2xl border p-4 text-xs ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                      Tus pedidos finalizados aparecerán aquí para que puedas calificar a la otra persona.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {resumenCalificaciones.pedidos.map(pedido => {
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
                    </div>
                  )}
                </section>
              )}

              {errorPerfil && <p role="alert" className={`mx-5 mt-5 rounded-xl border p-3 text-xs font-semibold md:mx-8 ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorPerfil}</p>}

              <div className={`grid gap-6 p-5 md:p-8 ${usuario.rol === 'repartidor' ? 'md:grid-cols-2' : ''}`}>
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
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cédula de identidad</p>
                      <p className="mt-1 text-sm font-semibold">{usuario.cedula || 'No registrada en esta cuenta'}</p>
                      <p className="mt-1 text-[10px] text-slate-500">La cédula no se puede modificar después del registro.</p>
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
          <section className="mx-auto w-full max-w-5xl space-y-6 py-6 md:py-10">
            <div className={`flex flex-col gap-4 rounded-3xl border p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5722]">Panel seguro</p>
                <h2 className={`mt-1 text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Panel de administración</h2>
                <p className="mt-1 text-xs text-slate-500">Gestiona pedidos, tarifas, actividad y pagos de Llévalo.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={usuario.rol === 'cliente'} onClick={() => void cambiarPerspectivaAdmin('cliente')} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${usuario.rol === 'cliente' ? 'border-[#FF5722] bg-orange-50 text-[#FF5722]' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Usar como cliente</button>
                <button type="button" aria-pressed={usuario.rol === 'repartidor'} onClick={() => void cambiarPerspectivaAdmin('repartidor')} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${usuario.rol === 'repartidor' ? 'border-[#FF5722] bg-orange-50 text-[#FF5722]' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Usar como repartidor</button>
                <button type="button" onClick={() => void cargarPanelAdmin()} disabled={cargandoAdmin} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs font-bold text-[#FF5722] disabled:opacity-50">
                  {cargandoAdmin ? 'Actualizando…' : 'Actualizar panel'}
                </button>
              </div>
            </div>

            {errorAdmin && <p role="alert" className={`rounded-xl border p-3 text-xs font-semibold ${darkMode ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{errorAdmin}</p>}
            {mensajeAdmin && <p role="status" className={`rounded-xl border p-3 text-xs font-semibold ${darkMode ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{mensajeAdmin}</p>}

            <AdminAccordion
              title="Buscar pedido"
              description="Por código numérico, fecha/hora o datos del pedido."
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

            <AdminAccordion
              title="Tarifas y moneda"
              description="Valores globales y moneda de visualización."
              darkMode={darkMode}
              badge={tasasCambio ? <span className="text-xs font-bold text-[#FF5722]">{formatoMoneda(tasasCambio.bolivaresPorDolar, 'VES')}</span> : undefined}
            >
              <div className="space-y-4">
              <form onSubmit={guardarTarifasAdmin} className="grid gap-3 sm:grid-cols-2">
                {([
                  ['enviosPorKm', 'Envíos por kilómetro (USD)'],
                  ['viajesCortoPorKm', 'Viajes menores de 1 km (USD/km)'],
                  ['viajesLargoPorKm', 'Viajes desde 1 km (USD/km)'],
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
                <label className="text-xs font-semibold">
                  Moneda que verán las cuentas
                  <select
                    value={configuracionTarifasAdmin.monedaVisualizacion}
                    onChange={event => {
                      const value = event.target.value;
                      if (value === 'VES' || value === 'EUR' || value === 'USDT') {
                        setConfiguracionTarifasAdmin(current => ({ ...current, monedaVisualizacion: value }));
                      }
                    }}
                    className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <option value="VES">Bolívares (VES)</option>
                    <option value="EUR">Euros (EUR)</option>
                    <option value="USDT">USDT</option>
                  </select>
                </label>
                <div className={`rounded-xl border p-3 text-[11px] sm:col-span-2 ${darkMode ? 'border-slate-800 bg-slate-950/60 text-slate-300' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                  {tasasCambio && configuracionTarifas && (
                    <p className="text-sm font-bold">{formatoMoneda(convertirDolares(1, configuracionTarifasAdmin.monedaVisualizacion, tasasCambio), configuracionTarifasAdmin.monedaVisualizacion)} <span className="text-[10px] font-normal text-slate-500">· Actualizado {new Date(tasasCambio.actualizadoEn).toLocaleString('es-VE')}</span></p>
                  )}
                  {tasasCambio?.desactualizada && <p className="mt-1 text-amber-600 dark:text-amber-300">Mostrando la última tasa disponible; la actualización externa falló.</p>}
                  <p className="mt-1">Las tarifas y pagos históricos siguen contabilizados en USD. Los cambios se reflejan automáticamente en las cuentas activas.</p>
                </div>
                {errorTarifas && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:col-span-2">{errorTarifas}</p>}
                <button type="submit" disabled={!configuracionTarifas || cargandoTarifas} className="rounded-xl bg-[#FF5722] px-5 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
                  {cargandoTarifas ? 'Cargando tarifas…' : 'Guardar tarifas globales'}
                </button>
              </form>
              </div>
            </AdminAccordion>

            <AdminAccordion
              title="Monitor de actividad"
              description="Cuentas activas y acciones recientes."
              darkMode={darkMode}
              badge={
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  {metricasAdmin ? `${metricasAdmin.usuarios_activos} activos` : 'En vivo'}
                </span>
              }
            >
              <div className="space-y-5">
              <p className="text-[11px] text-slate-500">Las cuentas activas se actualizan automáticamente cada 15 segundos.</p>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
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
                <article className={`col-span-2 rounded-2xl border p-4 lg:col-span-1 ${darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
                  <Clock size={17} className="text-violet-500" />
                  <p className="mt-3 text-sm font-black">Actualización automática</p>
                  <p className="mt-1 text-[11px] text-slate-500">La presencia se renueva mientras la app está abierta.</p>
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

            <AdminAccordion
              title="Pagos y configuración"
              description="Revisar pagos, editar Pago Móvil y acreditar saldo."
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
                  <article key={pago.id} className={`space-y-3 rounded-2xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
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

                <form onSubmit={recargarSaldoCorporativo} className={`space-y-4 rounded-3xl border p-5 shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-orange-100 bg-white'}`}>
                  <div>
                    <h3 className="text-base font-black">Acreditar saldo al cliente</h3>
                    <p className="mt-1 text-xs text-slate-500">Registra en la cuenta el abono que ya verificaste fuera de la app. El saldo sirve para pagar pedidos y queda en el historial.</p>
                  </div>
                  <input type="email" required value={emailRecargaSaldo} onChange={event => setEmailRecargaSaldo(event.target.value)} placeholder="cliente@empresa.com" className={`w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                  <input type="number" required min="0.01" max="10000" step="0.01" value={montoRecargaSaldo} onChange={event => setMontoRecargaSaldo(event.target.value)} placeholder="Monto base en USD" className={`w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                  <input type="text" required maxLength={250} value={notaRecargaSaldo} onChange={event => setNotaRecargaSaldo(event.target.value)} placeholder="Referencia del abono verificado" className={`w-full rounded-xl border px-3 py-2.5 text-sm ${darkMode ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50'}`} />
                  <p className="text-[10px] text-slate-500">Este proceso no cobra dinero: acredita manualmente el saldo luego de confirmar la recepción del pago.</p>
                  <button type="submit" className="w-full rounded-xl bg-[#FF5722] py-3 text-xs font-bold text-white">Acreditar saldo</button>
                </form>
              </div>
            </div>
            </AdminAccordion>

            <AdminAccordion
              title="Historial de pagos y acciones"
              description="Últimos movimientos, con pedido, método, monto, referencia, actor y hora."
              darkMode={darkMode}
              badge={historialPagosAdmin.length > 0 ? <span className="text-xs font-semibold text-slate-500">{historialPagosAdmin.length} movimientos</span> : undefined}
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
                    {perfilPublico.vehiculo_foto && <img src={perfilPublico.vehiculo_foto} alt="Vehículo del repartidor" className="max-h-44 w-full rounded-2xl object-cover" />}
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