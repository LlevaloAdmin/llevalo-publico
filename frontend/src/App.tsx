import React, { useState, useEffect, useRef } from 'react';
import { Bike, MapPin, ArrowRight, User, Eye, EyeOff, Clock, Send, Power, Star, CheckCircle, Moon, Sun, DollarSign, XCircle, Navigation } from 'lucide-react';
import MapaMapbox from './MapaMapbox';

interface PedidoReal {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
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
  estado: 'pendiente' | 'postulado' | 'aceptado' | 'entregado_repartidor' | 'completado' | 'cancelado';
  repartidor_lat?: number;
  repartidor_lon?: number;
  created_at?: string;
}

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
}

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'cliente' | 'repartidor' | 'perfil' | 'auth'>('home');
  const [serviceType, setServiceType] = useState<'comida' | 'mercado' | 'mandados' | 'viajes'>('comida');
  
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authRoleSelection, setAuthRoleSelection] = useState<'cliente' | 'repartidor'>('cliente');
  const [errorAuth, setErrorAuth] = useState('');

  const [repartidorOnline, setRepartidorOnline] = useState(true);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cedula, setCedula] = useState('');
  const [fotoLocal, setFotoLocal] = useState('');
  const [fotoVehiculoLocal, setFotoVehiculoLocal] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState('Moto Suzuki GN 125');
  const [placaVehiculo, setPlacaVehiculo] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [errorCedula, setErrorCedula] = useState('');
  const [errorPlaca, setErrorPlaca] = useState('');

  const [descripcionPedido, setDescripcionPedido] = useState('');
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  
  const [coordsUsuarioGPS, setCoordsUsuarioGPS] = useState<{ lat: number; lng: number } | null>(null);

  const [origenInput, setOrigenInput] = useState('');
  const [coordsOrigen, setCoordsOrigen] = useState<{ lat: number; lng: number } | null>(null);
  const [destinoInput, setDestinoInput] = useState('');
  const [coordsDestino, setCoordsDestino] = useState<{ lat: number; lng: number } | null>(null);
  
  const [modoSeleccionMapa, setModoSeleccionMapa] = useState<'origen' | 'destino' | null>(null);

  const [sugerenciasOrigen, setSugerenciasOrigen] = useState<any[]>([]);
  const [sugerenciasDestino, setSugerenciasDestino] = useState<any[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [distanciaKm, setDistanciaKm] = useState<number>(0);
  const [tiempoEstimadoMin, setTiempoEstimadoMin] = useState<number>(0);
  
  const rutaCompletaLista = Boolean(coordsOrigen && coordsDestino && origenInput.trim() && destinoInput.trim());

  const costoPorKm = serviceType === 'viajes' ? 0.80 : 0.50; 
  const tarifaTotal = rutaCompletaLista ? Math.max(1.5, distanciaKm * costoPorKm).toFixed(2) : '0.00';

  const [tasaBCV, setTasaBCV] = useState<number>(904.45);
  const tarifaEnBolivares = (parseFloat(tarifaTotal) * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [pedidosReales, setPedidosReales] = useState<PedidoReal[]>([]);
  const [postulacionesReales, setPostulacionesReales] = useState<Postulacion[]>([]);
  const [mensajesChat, setMensajesChat] = useState<MensajeChat[]>([]);
  const [nuevoMensajeTexto, setNuevoMensajeTexto] = useState('');

  const [segundosRestantes, setSegundosRestantes] = useState<number>(60);

  useEffect(() => {
    const dmGuardado = localStorage.getItem('llevalo_dark_mode');
    if (dmGuardado === 'true') setDarkMode(true);

    const sesionGuardada = localStorage.getItem('llevalo_usuario');
    if (sesionGuardada) {
      try {
        const parsed = JSON.parse(sesionGuardada);
        if (parsed && parsed.id) {
          setUsuario(parsed);
          if (parsed.foto) setFotoLocal(parsed.foto);
          if (parsed.cedula) setCedula(parsed.cedula);
          if (parsed.vehiculo) setTipoVehiculo(parsed.vehiculo);
          if (parsed.placa) setPlacaVehiculo(parsed.placa);
          if (parsed.vehiculo_foto) setFotoVehiculoLocal(parsed.vehiculo_foto);
        }
      } catch (e) {
        localStorage.removeItem('llevalo_usuario');
      }
    }

    fetch('https://ve.dolarapi.com/v1/dolares/oficial')
      .then(res => res.json())
      .then(data => {
        if (data && data.promedio) setTasaBCV(Number(data.promedio));
      })
      .catch(() => {});

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => {
          setCoordsUsuarioGPS({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.warn('GPS error:', err),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }
  }, []);

  useEffect(() => {
    if (usuario?.rol === 'repartidor' && coordsUsuarioGPS) {
      const pedidoAsignado = pedidosReales.find(p => p.repartidor_id === usuario.id && (p.estado === 'aceptado' || p.estado === 'entregado_repartidor'));
      if (pedidoAsignado) {
        fetch(`${API_URL}/api/pedidos/${pedidoAsignado.id}/ubicacion-repartidor`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: coordsUsuarioGPS.lat, lon: coordsUsuarioGPS.lng })
        }).catch(() => {});
      }
    }
  }, [coordsUsuarioGPS, pedidosReales, usuario]);

  const toggleDarkMode = () => {
    const nuevo = !darkMode;
    setDarkMode(nuevo);
    localStorage.setItem('llevalo_dark_mode', String(nuevo));
  };

  const sincronizarDatos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/pedidos`);
      if (res.ok) {
        const data = await res.json();
        setPedidosReales(Array.isArray(data.pedidos) ? data.pedidos : []);
        setPostulacionesReales(Array.isArray(data.postulaciones) ? data.postulaciones : []);
        setMensajesChat(Array.isArray(data.mensajes) ? data.mensajes : []);
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

  const validarCedulaFormato = (val: string) => {
    setCedula(val);
    const regex = /^[VvEe]-\d{6,8}$/;
    if (val && !regex.test(val.trim())) {
      setErrorCedula('Formato inválido. Usa ej: V-28123456');
    } else {
      setErrorCedula('');
    }
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
    setModoSeleccionMapa(null);

    if (tipoActual === 'origen') {
      setCoordsOrigen({ lat, lng });
      setOrigenInput('Buscando lugar...');
    } else {
      setCoordsDestino({ lat, lng });
      setDestinoInput('Buscando lugar...');
    }

    try {
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || '';
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=poi,address,neighborhood,place&language=es&limit=1`);
      const data = await res.json();
      const lugar = data?.features?.[0];
      const nombreLugar = lugar?.text || lugar?.place_name || `Ubicación (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      if (tipoActual === 'origen') setOrigenInput(nombreLugar);
      else setDestinoInput(nombreLugar);
    } catch (e) {
      const fallback = `Ubicación (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      if (tipoActual === 'origen') setOrigenInput(fallback);
      else setDestinoInput(fallback);
    }
  };

  const buscarDireccionGeocoding = async (query: string, tipo: 'origen' | 'destino') => {
    if (tipo === 'origen') {
      setOrigenInput(query);
      if (!query.trim()) { setCoordsOrigen(null); setSugerenciasOrigen([]); return; }
    } else {
      setDestinoInput(query);
      if (!query.trim()) { setCoordsDestino(null); setSugerenciasDestino([]); return; }
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || '';
        const bboxCarabobo = '-68.4,10.0,-67.7,10.5';
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=ve&bbox=${bboxCarabobo}&proximity=-68.0055,10.2291&types=poi,address,neighborhood,place&fuzzyMatch=true&autocomplete=true&language=es&limit=6`;
        
        const res = await fetch(endpoint);
        const data = await res.json();
        if (data && data.features) {
          const formatted = data.features.map((f: any) => ({
            display_name: f.place_name,
            lon: f.center[0],
            lat: f.center[1]
          }));
          if (tipo === 'origen') setSugerenciasOrigen(formatted);
          else setSugerenciasDestino(formatted);
        }
      } catch (e) { console.error(e); }
    }, 300);
  };

  const seleccionarSugerencia = (item: any, tipo: 'origen' | 'destino') => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (tipo === 'origen') {
      setCoordsOrigen({ lat, lng });
      setOrigenInput(item.display_name);
      setSugerenciasOrigen([]);
    } else {
      setCoordsDestino({ lat, lng });
      setDestinoInput(item.display_name);
      setSugerenciasDestino([]);
    }
  };

  const handleCrearPedido = async () => {
    if (!usuario) return;
    if (!rutaCompletaLista || !coordsOrigen || !coordsDestino) {
      alert('Por favor especifica y selecciona tanto el origen como el destino.');
      return;
    }
    setEnviandoPedido(true);

    try {
      const res = await fetch(`${API_URL}/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: usuario.id,
          cliente_nombre: usuario.nombre,
          cliente_cedula: usuario.cedula || 'V-00000000',
          cliente_foto: fotoLocal || usuario.foto || '',
          tipo_servicio: serviceType,
          descripcion: descripcionPedido || `Servicio de ${serviceType}`,
          origen_texto: origenInput, origen_lat: coordsOrigen.lat, origen_lon: coordsOrigen.lng,
          destino_texto: destinoInput, destino_lat: coordsDestino.lat, destino_lon: coordsDestino.lng,
          distancia_km: distanciaKm, tiempo_min: tiempoEstimadoMin, tarifa: tarifaTotal
        })
      });
      if (!res.ok) throw new Error('Error al publicar');
      setDescripcionPedido(''); setOrigenInput(''); setDestinoInput('');
      setCoordsOrigen(null); setCoordsDestino(null);
      setSegundosRestantes(60);
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
    finally { setEnviandoPedido(false); }
  };

  const cancelarPedidoActual = async (pedidoId: number) => {
    try {
      await fetch(`${API_URL}/api/pedidos/${pedidoId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevo_estado: 'cancelado' })
      });
      setCoordsOrigen(null); setCoordsDestino(null);
      setOrigenInput(''); setDestinoInput('');
      await sincronizarDatos();
    } catch (e) { alert('No se pudo cancelar el pedido.'); }
  };

  const postularsePedido = async (pedidoId: number) => {
    if (!usuario) return;
    try {
      const res = await fetch(`${API_URL}/api/pedidos/${pedidoId}/postular`, {
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

  const cancelarPostulacion = async (pedidoId: number) => {
    if (!usuario) return;
    try {
      await fetch(`${API_URL}/api/pedidos/${pedidoId}/postular/${usuario.id}`, { method: 'DELETE' });
      await sincronizarDatos();
    } catch (e) { alert('Error al cancelar postulación'); }
  };

  const aceptarPostulacion = async (pedidoId: number, post: Postulacion) => {
    try {
      const res = await fetch(`${API_URL}/api/pedidos/${pedidoId}/aceptar-postulacion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repartidor_id: post.repartidor_id, repartidor_nombre: post.repartidor_nombre,
          vehiculo: post.vehiculo, placa: post.placa, vehiculo_foto: post.vehiculo_foto || '', calificacion: post.calificacion || 4.9
        })
      });
      if (!res.ok) throw new Error('Error al aceptar');
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
  };

  const enviarMensaje = async (pedidoId: number) => {
    if (!usuario || !nuevoMensajeTexto.trim()) return;
    try {
      await fetch(`${API_URL}/api/pedidos/${pedidoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remitente_id: usuario.id, remitente_nombre: usuario.nombre, mensaje: nuevoMensajeTexto })
      });
      setNuevoMensajeTexto('');
      await sincronizarDatos();
    } catch (e) { console.error(e); }
  };

  const cambiarEstadoPedido = async (pedidoId: number, nuevoEstado: 'entregado_repartidor' | 'completado' | 'cancelado') => {
    try {
      await fetch(`${API_URL}/api/pedidos/${pedidoId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevo_estado })
      });
      if (nuevoEstado === 'completado') {
        setCoordsOrigen(null); setCoordsDestino(null);
        setOrigenInput(''); setDestinoInput('');
      }
      await sincronizarDatos();
    } catch (e) { console.error(e); }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (errorCedula || errorPlaca) {
      alert('Por favor corrige los errores en cédula o placa antes de continuar.');
      return;
    }
    setErrorAuth('');

    const payload = authMode === 'login' 
      ? { email, password }
      : { 
          nombre, email, telefono, 
          cedula: cedula || 'V-00000000', foto: fotoLocal, 
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
      setActiveTab(data.usuario.rol === 'cliente' ? 'cliente' : 'repartidor');
    } catch (err: any) {
      setErrorAuth(err.message);
    }
  };

  const guardarPerfil = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario) return;
    const actualizado = { ...usuario, cedula, foto: fotoLocal, vehiculo: tipoVehiculo, placa: placaVehiculo, vehiculo_foto: fotoVehiculoLocal };
    setUsuario(actualizado);
    localStorage.setItem('llevalo_usuario', JSON.stringify(actualizado));
    alert('✓ Perfil actualizado con éxito');
    setActiveTab(usuario.rol === 'cliente' ? 'cliente' : 'repartidor');
  };

  const handleLogout = () => {
    localStorage.clear();
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

  const tieneTrabajoActivoOPostulacionRepartidor = usuario?.rol === 'repartidor' && (
    Boolean(pedidoAsignadoRepartidor) || 
    postulacionesReales.some(p => p.repartidor_id === usuario.id && p.estado === 'pendiente')
  );

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#FDFBF7] text-slate-800'}`}>
      <header className={`border-b backdrop-blur sticky top-0 z-50 px-4 md:px-10 py-3 flex justify-between items-center shadow-sm transition-colors ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-[#FDFBF7]/90 border-orange-100'}`}>
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('home')}>
          <div className="bg-[#FF5722] text-white w-9 h-9 rounded-2xl font-black text-lg flex items-center justify-center shadow-md">L</div>
          <span className={`text-xl md:text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Llévalo</span>
        </div>
        
        <nav className={`hidden md:flex space-x-2 p-1.5 rounded-2xl border ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-orange-50/80 border-orange-100'}`}>
          <button onClick={() => setActiveTab('home')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'home' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Inicio</button>
          {usuario && usuario.rol === 'cliente' && <button onClick={() => setActiveTab('cliente')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'cliente' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Pedir</button>}
          {usuario && usuario.rol === 'repartidor' && <button onClick={() => setActiveTab('repartidor')} className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'repartidor' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Radar de Trabajos</button>}
        </nav>

        <div className="flex items-center space-x-2 md:space-x-3">
          <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl border text-[11px] md:text-xs font-bold shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-orange-50 border-orange-200 text-slate-700'}`}>
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
              <button onClick={handleLogout} className="text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/35 px-2 py-1 rounded-xl border border-red-200 cursor-pointer">Salir</button>
            </div>
          ) : (
            <button onClick={() => { setErrorAuth(''); setActiveTab('auth'); }} className={`flex items-center space-x-1.5 border px-4 py-2 rounded-2xl transition text-xs md:text-sm font-bold shadow-sm cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800' : 'bg-white hover:bg-orange-50 border-orange-200 text-slate-800'}`}>
              <User size={16} className="text-[#FF5722]" />
              <span>Ingresar</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4 md:p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'home' && (
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
                Comida, mercado, mandados y viajes. Conoce el perfil verificado, la moto y la reputación de tu repartidor antes de aceptar.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                {(!usuario || usuario.rol === 'cliente') && (
                  <button onClick={() => { if (!usuario) { setAuthRoleSelection('cliente'); setActiveTab('auth'); } else setActiveTab('cliente'); }} className="bg-[#FF5722] hover:bg-[#F4511E] text-white font-bold px-8 py-4 rounded-2xl transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer">
                    <span>Hacer un pedido</span>
                    <ArrowRight size={18} />
                  </button>
                )}
                {(!usuario || usuario.rol === 'repartidor') && (
                  <button onClick={() => { if (!usuario) { setAuthRoleSelection('repartidor'); setActiveTab('auth'); } else setActiveTab('repartidor'); }} className={`border font-bold px-8 py-4 rounded-2xl transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800' : 'bg-white hover:bg-orange-50 border-orange-200 text-slate-800'}`}>
                    <Bike size={18} className="text-[#FF5722]" />
                    <span>Quiero ser repartidor</span>
                  </button>
                )}
              </div>
            </div>

            {/* Imagen del menú principal actualizada acorde a la solicitud del cliente y referencia estilo profesional */}
            <div className="relative">
              <div className={`rounded-3xl overflow-hidden shadow-xl border p-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-orange-100 border-orange-200'}`}>
                <img src="https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1000&q=80" alt="Moto y servicio premium" className="rounded-2xl object-cover w-full h-[420px]" />
              </div>
            </div>
          </div>
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
                      <input type="text" required value={cedula} onChange={e => validarCedulaFormato(e.target.value)} placeholder="Ej. V-28123456" className={`w-full border rounded-xl px-4 py-2 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                      {errorCedula && <p className="text-[10px] text-red-600 font-bold mt-1">{errorCedula}</p>}
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
                </div>

                <button type="submit" className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white font-bold py-3 rounded-2xl transition shadow-md cursor-pointer mt-2">
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
                  <button onClick={toggleDarkMode} title="Cambiar Tema" className={`p-2 rounded-xl border transition cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-orange-50 border-orange-200 text-slate-700'}`}>
                    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl border bg-slate-100 dark:bg-slate-950 dark:border-slate-800">
                  {(['comida', 'mercado', 'mandados', 'viajes'] as const).map(t => (
                    <button key={t} onClick={() => setServiceType(t)} className={`py-2 text-[11px] font-bold rounded-xl capitalize transition cursor-pointer ${serviceType === t ? 'bg-[#FF5722] text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                      {t}
                    </button>
                  ))}
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
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Origen (Retirada)</label>
                      <div className="flex space-x-2 mt-1">
                        <input type="text" value={origenInput} onChange={e => { setOrigenInput(e.target.value); buscarDireccionGeocoding(e.target.value, 'origen'); }} placeholder="Buscar origen en San Diego / Carabobo" className={`flex-1 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                        <button type="button" onClick={() => setModoSeleccionMapa('origen')} className={`px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${modoSeleccionMapa === 'origen' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>Mapa</button>
                      </div>
                      {sugerenciasOrigen.length > 0 && (
                        <div className={`border rounded-xl mt-1 max-h-36 overflow-y-auto z-20 absolute w-72 shadow-lg ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                          {sugerenciasOrigen.map((s, idx) => (
                            <div key={idx} onClick={() => seleccionarSugerencia(s, 'origen')} className={`p-2 text-xs cursor-pointer border-b last:border-0 ${darkMode ? 'hover:bg-slate-800 border-slate-800 text-slate-200' : 'hover:bg-orange-50 border-orange-50 text-slate-700'}`}>
                              {s.display_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Destino (Entrega)</label>
                      <div className="flex space-x-2 mt-1">
                        <input type="text" value={destinoInput} onChange={e => { setDestinoInput(e.target.value); buscarDireccionGeocoding(e.target.value, 'destino'); }} placeholder="Buscar destino en San Diego / Carabobo" className={`flex-1 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                        <button type="button" onClick={() => setModoSeleccionMapa('destino')} className={`px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${modoSeleccionMapa === 'destino' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 border-red-200'}`}>Mapa</button>
                      </div>
                      {sugerenciasDestino.length > 0 && (
                        <div className={`border rounded-xl mt-1 max-h-36 overflow-y-auto z-20 absolute w-72 shadow-lg ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                          {sugerenciasDestino.map((s, idx) => (
                            <div key={idx} onClick={() => seleccionarSugerencia(s, 'destino')} className={`p-2 text-xs cursor-pointer border-b last:border-0 ${darkMode ? 'hover:bg-slate-800 border-slate-800 text-slate-200' : 'hover:bg-orange-50 border-orange-50 text-slate-700'}`}>
                              {s.display_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Descripción del pedido</label>
                      <textarea value={descripcionPedido} onChange={e => setDescripcionPedido(e.target.value)} placeholder="Ej. 2 hamburguesas con queso y refresco" rows={2} className={`w-full border rounded-xl px-3 py-2 text-xs mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>

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

                    <button disabled={!rutaCompletaLista || enviandoPedido} onClick={handleCrearPedido} className={`w-full py-3 rounded-xl font-bold text-xs transition cursor-pointer shadow-md ${!rutaCompletaLista ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white'}`}>
                      {enviandoPedido ? 'Publicando...' : 'Publicar Pedido en Radar'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Contenedor corregido para que el mapa llene perfectamente el espacio vertical sin cortes */}
            <div className="lg:col-span-7 h-[600px] lg:h-[calc(100vh-140px)] rounded-3xl overflow-hidden border shadow-sm sticky top-20">
              <MapaMapbox
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
                onRutaCalculada={(km, min) => { setDistanciaKm(km); setTiempoEstimadoMin(min); }}
                mostrarRuta={true}
                mostrarPines={true}
                darkMode={darkMode}
              />
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
                
                {/* Botón de power bloqueado si tiene trabajo activo o postulación pendiente */}
                <button 
                  disabled={tieneTrabajoActivoOPostulacionRepartidor} 
                  onClick={() => {
                    if (!tieneTrabajoActivoOPostulacionRepartidor) setRepartidorOnline(!repartidorOnline);
                  }} 
                  title={tieneTrabajoActivoOPostulacionRepartidor ? "No puedes desconectarte con un trabajo en curso o postulación activa" : "Cambiar estatus"}
                  className={`p-2 rounded-xl border transition cursor-pointer ${tieneTrabajoActivoOPostulacionRepartidor ? 'opacity-50 cursor-not-allowed bg-slate-200 border-slate-300 text-slate-400' : (repartidorOnline ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200')}`}
                >
                  <Power size={18} />
                </button>

                <button onClick={toggleDarkMode} title="Cambiar Tema" className={`p-2 rounded-xl border transition cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-orange-50 border-orange-200 text-slate-700'}`}>
                  {darkMode ? <Sun size={18} /> : <Moon size={18} />}
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
                      <p><strong>Descripción:</strong> {pedidoAsignadoRepartidor.descripcion}</p>
                      <p><strong>Origen (Punto A):</strong> {pedidoAsignadoRepartidor.origen_texto}</p>
                      <p><strong>Destino (Punto B):</strong> {pedidoAsignadoRepartidor.destino_texto}</p>
                    </div>

                    {pedidoAsignadoRepartidor.estado === 'aceptado' && (
                      <button onClick={() => cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'entregado_repartidor')} className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white text-xs font-bold py-3 rounded-xl transition cursor-pointer shadow-sm">
                        Llegué al Punto A / Retirado
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
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-orange-100 text-[#FF5722]">{p.tipo_servicio} · {p.distancia_km} km</span>
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

              {/* Mapa expandido y manipulable en la perspectiva del repartidor al tener carrera activa */}
              <div className="lg:col-span-7 h-[600px] lg:h-[calc(100vh-140px)] rounded-3xl overflow-hidden border shadow-sm sticky top-20">
                <MapaMapbox
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
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'perfil' && usuario && (
          <div className="max-w-md mx-auto w-full py-8">
            <div className={`border p-6 rounded-3xl shadow-sm space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
              <h3 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Editar mi Perfil</h3>

              <form onSubmit={guardarPerfil} className="space-y-4">
                <div>
                  <label className="text-xs font-bold">Cédula</label>
                  <input type="text" value={cedula} onChange={e => validarCedulaFormato(e.target.value)} className={`w-full border rounded-xl px-3 py-2 text-xs mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                  {errorCedula && <p className="text-[10px] text-red-600 font-bold mt-1">{errorCedula}</p>}
                </div>

                {usuario.rol === 'repartidor' && (
                  <>
                    <div>
                      <label className="text-xs font-bold">Vehículo</label>
                      <input type="text" value={tipoVehiculo} onChange={e => setTipoVehiculo(e.target.value)} className={`w-full border rounded-xl px-3 py-2 text-xs mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>
                    <div>
                      <label className="text-xs font-bold">Placa</label>
                      <input type="text" value={placaVehiculo} onChange={e => validarPlacaFormato(e.target.value)} className={`w-full border rounded-xl px-3 py-2 text-xs mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                      {errorPlaca && <p className="text-[10px] text-red-600 font-bold mt-1">{errorPlaca}</p>}
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-bold">Foto de Perfil (Opcional)</label>
                  <input type="file" accept="image/*" onChange={e => convertirImagenSegura(e, setFotoLocal)} className="text-xs mt-1 block" />
                  {fotoLocal && <img src={fotoLocal} alt="Preview" className="w-16 h-16 rounded-full object-cover mt-2 border-2 border-[#FF5722]" />}
                </div>

                <button type="submit" className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white py-3 rounded-xl font-bold text-xs cursor-pointer shadow-md">
                  Guardar Cambios
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}