import React, { useState, useEffect, useRef } from 'react';
import { Bike, MapPin, ArrowRight, User, Eye, EyeOff, Clock, Send, Power, Star, CheckCircle, Moon, Sun, DollarSign } from 'lucide-react';
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
  const [cargandoAuth, setCargandoAuth] = useState(false);
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
  
  // Ubicación GPS del usuario en tiempo real con Pin Azul
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

  const tasaBCV = 904.45;
  const tarifaEnBolivares = (parseFloat(tarifaTotal) * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [pedidosReales, setPedidosReales] = useState<PedidoReal[]>([]);
  const [postulacionesReales, setPostulacionesReales] = useState<Postulacion[]>([]);
  const [mensajesChat, setMensajesChat] = useState<MensajeChat[]>([]);
  const [nuevoMensajeTexto, setNuevoMensajeTexto] = useState('');

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

    // Solicitar geolocalización en tiempo real para móviles y PC
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoordsUsuarioGPS({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          console.warn('Geolocalización no disponible o denegada, usando San Diego por defecto.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

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
        const listaPedidos = Array.isArray(data.pedidos) ? data.pedidos : [];
        
        const ahora = Date.now();
        for (const p of listaPedidos) {
          if (p.estado === 'pendiente' || p.estado === 'postulado') {
            const tiempoCreacion = p.created_at ? new Date(p.created_at).getTime() : ahora;
            if (ahora - tiempoCreacion > 60000) {
              await fetch(`${API_URL}/api/pedidos/${p.id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevo_estado: 'cancelado' })
              });
            }
          }
        }

        setPedidosReales(listaPedidos);
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
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=poi,address,neighborhood,place&language=es&limit=1`
      );
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
      if (!query.trim()) { 
        setCoordsOrigen(null);
        setSugerenciasOrigen([]); 
        return; 
      }
    } else {
      setDestinoInput(query);
      if (!query.trim()) { 
        setCoordsDestino(null);
        setSugerenciasDestino([]); 
        return; 
      }
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
          origen_texto: origenInput, 
          origen_lat: coordsOrigen.lat, 
          origen_lon: coordsOrigen.lng,
          destino_texto: destinoInput, 
          destino_lat: coordsDestino.lat, 
          destino_lon: coordsDestino.lng,
          distancia_km: distanciaKm, 
          tiempo_min: tiempoEstimadoMin, 
          tarifa: tarifaTotal
        })
      });
      if (!res.ok) throw new Error('Error al publicar');
      setDescripcionPedido('');
      setOrigenInput('');
      setDestinoInput('');
      setCoordsOrigen(null);
      setCoordsDestino(null);
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
      setCoordsOrigen(null);
      setCoordsDestino(null);
      setOrigenInput('');
      setDestinoInput('');
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
          repartidor_id: usuario.id,
          repartidor_nombre: usuario.nombre,
          vehiculo: usuario.vehiculo || 'Moto Suzuki GN',
          placa: usuario.placa || 'ABC-123',
          vehiculo_foto: fotoVehiculoLocal || usuario.vehiculo_foto || '',
          calificacion: usuario.calificacion || 4.9
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
  };

  const aceptarPostulacion = async (pedidoId: number, post: Postulacion) => {
    try {
      const res = await fetch(`${API_URL}/api/pedidos/${pedidoId}/aceptar-postulacion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repartidor_id: post.repartidor_id,
          repartidor_nombre: post.repartidor_nombre,
          vehiculo: post.vehiculo,
          placa: post.placa,
          vehiculo_foto: post.vehiculo_foto || '',
          calificacion: post.calificacion || 4.9
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
        body: JSON.stringify({ nuevo_estado: nuevoEstado })
      });
      if (nuevoEstado === 'completado') {
        setCoordsOrigen(null);
        setCoordsDestino(null);
        setOrigenInput('');
        setDestinoInput('');
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
    setCargandoAuth(true);

    const payload = authMode === 'login' 
      ? { email, password }
      : { 
          nombre, email, telefono, 
          cedula: cedula || 'V-00000000', 
          foto: fotoLocal, 
          vehiculo: tipoVehiculo, 
          placa: placaVehiculo || 'ABC-123', 
          vehiculo_foto: fotoVehiculoLocal,
          calificacion: 4.9,
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
    } finally {
      setCargandoAuth(false);
    }
  };

  const guardarPerfil = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario) return;
    const actualizado = { 
      ...usuario, 
      cedula, 
      foto: fotoLocal, 
      vehiculo: tipoVehiculo, 
      placa: placaVehiculo,
      vehiculo_foto: fotoVehiculoLocal 
    };
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

  const gananciasRepartidor = usuario?.rol === 'repartidor' && Array.isArray(pedidosReales)
    ? pedidosReales.filter(p => p.repartidor_id === usuario.id && p.estado === 'completado').reduce((a, b) => a + parseFloat(b.tarifa), 0).toFixed(2)
    : '0.00';

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#FDFBF7] text-slate-800'}`}>
      <header className={`border-b backdrop-blur sticky top-0 z-50 px-6 md:px-10 py-4 flex justify-between items-center shadow-sm transition-colors ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-[#FDFBF7]/90 border-orange-100'}`}>
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('home')}>
          <div className="bg-[#FF5722] text-white w-10 h-10 rounded-2xl font-black text-xl flex items-center justify-center shadow-md">L</div>
          <span className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Llévalo</span>
        </div>
        
        <nav className={`hidden md:flex space-x-2 p-1.5 rounded-2xl border ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-orange-50/80 border-orange-100'}`}>
          <button onClick={() => setActiveTab('home')} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'home' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Inicio</button>
          {usuario && usuario.rol === 'cliente' && <button onClick={() => setActiveTab('cliente')} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'cliente' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Pedir</button>}
          {usuario && usuario.rol === 'repartidor' && <button onClick={() => setActiveTab('repartidor')} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === 'repartidor' ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}>Radar de Trabajos</button>}
        </nav>

        <div className="flex items-center space-x-3">
          {/* Tasa BCV Oficial única */}
          <div className={`hidden sm:flex items-center space-x-2 px-3.5 py-2 rounded-2xl border text-xs font-bold shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-orange-50 border-orange-200 text-slate-700'}`}>
            <DollarSign size={14} className="text-[#FF5722]" />
            <span>BCV: <strong>Bs. {tasaBCV}</strong></span>
          </div>

          <button onClick={toggleDarkMode} title="Cambiar Tema" className={`p-2.5 rounded-2xl border transition cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800' : 'bg-white border-orange-200 text-slate-700 hover:bg-orange-50'}`}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {usuario ? (
            <div className={`flex items-center space-x-3 border px-3 py-1.5 rounded-2xl shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
              {fotoLocal ? (
                <img src={fotoLocal} alt="Avatar" className="w-9 h-9 rounded-full object-cover border-2 border-[#FF5722]" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-orange-100 text-[#FF5722] flex items-center justify-center font-bold text-xs">
                  {usuario.nombre ? usuario.nombre.substring(0, 2).toUpperCase() : 'U'}
                </div>
              )}
              <div className="text-right hidden sm:block cursor-pointer" onClick={() => setActiveTab('perfil')}>
                <p className={`text-xs font-black hover:underline ${darkMode ? 'text-white' : 'text-slate-900'}`}>{usuario.nombre}</p>
                <p className="text-[10px] font-bold text-[#FF5722] uppercase">{usuario.rol} · Mi Perfil</p>
              </div>
              <button onClick={handleLogout} className="text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/35 px-2.5 py-1.5 rounded-xl border border-red-200 cursor-pointer">Salir</button>
            </div>
          ) : (
            <button onClick={() => { setErrorAuth(''); setActiveTab('auth'); }} className={`flex items-center space-x-2 border px-5 py-2.5 rounded-2xl transition text-sm font-bold shadow-sm cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800' : 'bg-white hover:bg-orange-50 border-orange-200 text-slate-800'}`}>
              <User size={18} className="text-[#FF5722]" />
              <span>Ingresar</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'home' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-8 lg:py-14">
            <div className="space-y-6">
              <div className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase border ${darkMode ? 'bg-orange-950/60 border-orange-900 text-orange-300' : 'bg-orange-100 border-orange-200 text-[#FF5722]'}`}>
                <MapPin size={14} className="text-[#FF5722]" />
                <span>San Diego, Carabobo, Venezuela 🇻🇪</span>
              </div>
              <h1 className={`text-5xl lg:text-7xl font-black tracking-tight leading-[1.08] ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Lo que necesites, <span className="text-[#FF5722]">llévalo ya.</span>
              </h1>
              <p className={`text-lg leading-relaxed max-w-xl ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
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

            <div className="relative">
              <div className={`rounded-3xl overflow-hidden shadow-xl border p-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-orange-100 border-orange-200'}`}>
                <img src="https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80" alt="Repartidor urbano" className="rounded-2xl object-cover w-full h-[430px]" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'auth' && (
          <div className="max-w-md mx-auto w-full py-10">
            <div className={`border p-8 rounded-3xl shadow-sm space-y-6 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
              <div className="text-center space-y-2">
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

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nombre Completo</label>
                      <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Alirio Pérez" className={`w-full border rounded-xl px-4 py-2.5 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Teléfono</label>
                      <input type="text" required value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Ej. 04121234567" className={`w-full border rounded-xl px-4 py-2.5 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Cédula de Identidad</label>
                      <input type="text" required value={cedula} onChange={e => validarCedulaFormato(e.target.value)} placeholder="Ej. V-28123456" className={`w-full border rounded-xl px-4 py-2.5 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                      {errorCedula && <p className="text-[10px] text-red-600 font-bold mt-1">{errorCedula}</p>}
                    </div>
                  </>
                )}

                <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Correo Electrónico</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" className={`w-full border rounded-xl px-4 py-2.5 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                </div>

                <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Contraseña</label>
                  <div className="relative mt-1">
                    <input type={mostrarPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={`w-full border rounded-xl px-4 py-2.5 text-sm pr-10 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    <button type="button" onClick={() => setMostrarPassword(!mostrarPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                      {mostrarPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={cargandoAuth} className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white font-bold py-3.5 rounded-xl cursor-pointer shadow-md">
                  {cargandoAuth ? 'Procesando...' : (authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse')}
                </button>
              </form>

              <div className="text-center pt-2">
                <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-xs font-bold text-[#FF5722] hover:underline cursor-pointer">
                  {authMode === 'login' ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'perfil' && usuario && (
          <div className="max-w-xl mx-auto w-full py-6">
            <div className={`border p-8 rounded-3xl shadow-sm space-y-6 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100'}`}>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  {fotoLocal ? (
                    <img src={fotoLocal} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-4 border-[#FF5722]" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-orange-100 text-[#FF5722] flex items-center justify-center font-bold text-xl">
                      {usuario.nombre ? usuario.nombre.substring(0, 2).toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{usuario.nombre}</h2>
                  <p className="text-xs font-bold text-[#FF5722] uppercase">Rol: {usuario.rol} · Verificado ✓</p>
                </div>
              </div>

              <div className={`p-4 rounded-2xl border flex justify-between items-center ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-100'}`}>
                <div>
                  <p className={`text-xs font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Modo Oscuro</p>
                  <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Activa o desactiva la interfaz nocturna</p>
                </div>
                <button type="button" onClick={toggleDarkMode} className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-2 ${darkMode ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-white'}`}>
                  {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                  <span>{darkMode ? 'Desactivar' : 'Activar'}</span>
                </button>
              </div>

              <form onSubmit={guardarPerfil} className="space-y-4">
                <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Foto de Perfil (Dispositivo)</label>
                  <input type="file" accept="image/*" onChange={(e) => convertirImagenSegura(e, setFotoLocal)} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-[#FF5722] hover:file:bg-orange-100 mt-1" />
                </div>
                <div>
                  <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Cédula de Identidad</label>
                  <input type="text" value={cedula} onChange={e => validarCedulaFormato(e.target.value)} placeholder="Ej. V-28123456" className={`w-full border rounded-xl px-4 py-2.5 text-sm mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                  {errorCedula && <p className="text-[10px] text-red-600 font-bold mt-1">{errorCedula}</p>}
                </div>

                {usuario.rol === 'repartidor' && (
                  <div className={`space-y-4 pt-2 border-t ${darkMode ? 'border-slate-800' : 'border-orange-100'}`}>
                    <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos de tu Vehículo</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tipo / Modelo</label>
                        <select value={tipoVehiculo} onChange={e => setTipoVehiculo(e.target.value)} className={`w-full border rounded-xl px-3 py-2 text-xs mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`}>
                          <option value="Moto Suzuki GN">Moto (Suzuki / Keeway)</option>
                          <option value="Carro Sedán">Carro Sedán</option>
                          <option value="Camioneta Pickup">Camioneta / SUV</option>
                          <option value="Camión Carga">Camión de Carga</option>
                        </select>
                      </div>
                      <div>
                        <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Placa</label>
                        <input type="text" value={placaVehiculo} onChange={e => validarPlacaFormato(e.target.value)} placeholder="Ej. AB123CD" className={`w-full border rounded-xl px-3 py-2 text-xs mt-1 ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                        {errorPlaca && <p className="text-[10px] text-red-600 font-bold mt-1">{errorPlaca}</p>}
                      </div>
                    </div>
                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Foto del Vehículo (Dispositivo)</label>
                      <input type="file" accept="image/*" onChange={(e) => convertirImagenSegura(e, setFotoVehiculoLocal)} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-[#FF5722] hover:file:bg-orange-100 mt-1" />
                    </div>
                  </div>
                )}

                <button type="submit" className="w-full bg-[#FF5722] text-white font-bold py-3.5 rounded-xl cursor-pointer shadow-md">
                  Guardar Cambios de Perfil
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'cliente' && usuario && usuario.rol === 'cliente' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-4">
            <div className={`border p-6 rounded-3xl shadow-sm space-y-5 relative ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-800'}`}>
              {pedidoActivoCliente ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-orange-100 text-[#FF5722]">
                      Pedido #{pedidoActivoCliente.id} · {pedidoActivoCliente.tipo_servicio}
                    </span>
                    <span className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>${pedidoActivoCliente.tarifa}</span>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-4 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="text-xs font-black text-red-900 dark:text-red-300">Estado del servicio en curso</p>
                      <p className="text-[10px] text-red-600 dark:text-red-400">Puedes cancelar el viaje si lo deseas</p>
                    </div>
                    <button onClick={() => cancelarPedidoActual(pedidoActivoCliente.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer shadow-sm transition">
                      Cancelar Pedido
                    </button>
                  </div>

                  {pedidoActivoCliente.estado === 'pendiente' || pedidoActivoCliente.estado === 'postulado' ? (
                    <div className="space-y-3">
                      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-4 rounded-2xl space-y-1">
                        <div className="flex items-center space-x-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                          <Clock size={18} className="animate-spin" />
                          <span>Postulaciones de repartidores</span>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-400">Compara la foto y reputación antes de aceptar. (Expira en 60s)</p>
                      </div>

                      {postulacionesPedidoActual.length === 0 ? (
                        <div className={`text-center p-6 border rounded-2xl text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                          Buscando repartidores cercanos en Carabobo...
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {postulacionesPedidoActual.map((post) => (
                            <div key={post.id} className={`border p-3 rounded-2xl flex items-center justify-between ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-orange-200'}`}>
                              <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-1">
                                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" alt="Repartidor" className="w-10 h-10 rounded-full object-cover border-2 border-[#FF5722]" />
                                  {post.vehiculo_foto && (
                                    <img src={post.vehiculo_foto} alt="Vehículo" className="w-10 h-10 rounded-xl object-cover border-2 border-slate-300" title="Vehículo" />
                                  )}
                                </div>
                                <div>
                                  <p className={`text-xs font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{post.repartidor_nombre}</p>
                                  <div className="flex items-center space-x-1 text-[10px] text-amber-600 font-bold">
                                    <Star size={12} fill="currentColor" />
                                    <span>{post.calificacion || 4.9}</span>
                                    <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>· {post.vehiculo}</span>
                                  </div>
                                </div>
                              </div>
                              <button onClick={() => aceptarPostulacion(pedidoActivoCliente.id, post)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl cursor-pointer">
                                Aceptar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : pedidoActivoCliente.estado === 'entregado_repartidor' ? (
                    <div className="space-y-4">
                      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-4 rounded-2xl space-y-2">
                        <p className="text-xs font-black text-amber-900 dark:text-amber-300 uppercase">📦 Paquete entregado por el repartidor</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">El repartidor ha marcado el pedido como entregado. Confirma si ya lo recibiste para finalizar.</p>
                      </div>

                      <button onClick={() => cambiarEstadoPedido(pedidoActivoCliente.id, 'completado')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs cursor-pointer shadow-md flex items-center justify-center space-x-2">
                        <CheckCircle size={16} />
                        <span>Confirmar Paquete Recibido ✓</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 p-4 rounded-2xl space-y-2">
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">¡Repartidor en camino!</p>
                        <div className="flex items-center space-x-3">
                          <img src={pedidoActivoCliente.repartidor_foto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"} alt="Repartidor" className="w-12 h-12 rounded-full object-cover border-2 border-emerald-600" />
                          <div>
                            <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{pedidoActivoCliente.repartidor_nombre}</p>
                            <div className="flex items-center space-x-1 text-xs text-amber-600 font-bold">
                              <Star size={12} fill="currentColor" />
                              <span>{pedidoActivoCliente.repartidor_calificacion || 4.9}</span>
                            </div>
                            <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{pedidoActivoCliente.repartidor_vehiculo} · <span className="font-bold">{pedidoActivoCliente.repartidor_placa}</span></p>
                          </div>
                        </div>
                      </div>

                      <div className={`border p-4 rounded-2xl space-y-3 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <h4 className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Chat con tu Repartidor</h4>
                        <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                          {mensajesChat.filter(m => m.pedido_id === pedidoActivoCliente.id).map((m) => (
                            <div key={m.id} className={`p-2 rounded-xl text-xs ${m.remitente_id === usuario.id ? (darkMode ? 'bg-orange-950/60 text-white ml-6' : 'bg-orange-100 text-slate-900 ml-6') : (darkMode ? 'bg-slate-900 border border-slate-800 text-slate-200 mr-6' : 'bg-white border border-slate-200 text-slate-800 mr-6')}`}>
                              <p className="font-bold text-[10px] text-[#FF5722]">{m.remitente_nombre}</p>
                              <p>{m.mensaje}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={nuevoMensajeTexto} onChange={e => setNuevoMensajeTexto(e.target.value)} placeholder="Escribe un mensaje..." className={`flex-1 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200'}`} />
                          <button onClick={() => enviarMensaje(pedidoActivoCliente.id)} className="bg-[#FF5722] text-white p-2.5 rounded-xl cursor-pointer"><Send size={14} /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Crear Nuevo Pedido</h2>

                  <div className={`grid grid-cols-4 gap-1.5 p-1 rounded-2xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-100'}`}>
                    {(['comida', 'mercado', 'mandados', 'viajes'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setServiceType(t)} className={`py-2 text-[11px] font-bold rounded-xl uppercase transition cursor-pointer ${serviceType === t ? 'bg-[#FF5722] text-white shadow-sm' : (darkMode ? 'text-slate-400' : 'text-slate-600')}`}>{t}</button>
                    ))}
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="relative">
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Punto de Origen (San Diego / Carabobo)</label>
                      <div className="flex items-center space-x-2 mt-1">
                        <input
                          type="text"
                          value={origenInput}
                          onChange={e => buscarDireccionGeocoding(e.target.value, 'origen')}
                          placeholder="Ej. Urb. El Morro o toca el pin verde →"
                          className={`flex-1 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setModoSeleccionMapa(modoSeleccionMapa === 'origen' ? null : 'origen')}
                          title="Ubicar pin verde manualmente en el mapa"
                          className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                            modoSeleccionMapa === 'origen'
                              ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300'
                              : (darkMode ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50 hover:bg-emerald-900/50' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200')
                          }`}
                        >
                          <MapPin size={16} />
                        </button>
                      </div>
                      {sugerenciasOrigen.length > 0 && (
                        <div className={`absolute z-50 left-0 right-0 border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200'}`}>
                          {sugerenciasOrigen.map((s, i) => (
                            <div key={i} onClick={() => seleccionarSugerencia(s, 'origen')} className={`p-2.5 text-xs cursor-pointer border-b last:border-0 ${darkMode ? 'hover:bg-slate-900 border-slate-800' : 'hover:bg-orange-50 border-slate-100'}`}>
                              {s.display_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Punto de Destino (Carabobo)</label>
                      <div className="flex items-center space-x-2 mt-1">
                        <input
                          type="text"
                          value={destinoInput}
                          onChange={e => buscarDireccionGeocoding(e.target.value, 'destino')}
                          placeholder="Ej. CC Fin de Siglo o toca el pin rojo →"
                          className={`flex-1 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setModoSeleccionMapa(modoSeleccionMapa === 'destino' ? null : 'destino')}
                          title="Ubicar pin rojo manualmente en el mapa"
                          className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                            modoSeleccionMapa === 'destino'
                              ? 'bg-red-600 text-white border-red-700 ring-2 ring-red-300'
                              : (darkMode ? 'bg-red-950/40 text-red-400 border-red-900/50 hover:bg-red-900/50' : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200')
                          }`}
                        >
                          <MapPin size={16} />
                        </button>
                      </div>
                      {sugerenciasDestino.length > 0 && (
                        <div className={`absolute z-50 left-0 right-0 border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200'}`}>
                          {sugerenciasDestino.map((s, i) => (
                            <div key={i} onClick={() => seleccionarSugerencia(s, 'destino')} className={`p-2.5 text-xs cursor-pointer border-b last:border-0 ${darkMode ? 'hover:bg-slate-900 border-slate-800' : 'hover:bg-orange-50 border-slate-100'}`}>
                              {s.display_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Descripción / Detalles</label>
                      <textarea value={descripcionPedido} onChange={e => setDescripcionPedido(e.target.value)} placeholder="¿Qué deseas pedir o enviar?" rows={2} className={`w-full border rounded-xl p-3 text-xs mt-1 resize-none ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200'}`} />
                    </div>

                    {rutaCompletaLista && (
                      <div className={`border p-3.5 rounded-2xl space-y-2 text-xs animate-fadeIn ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-200'}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Distancia: <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{distanciaKm} km</span></p>
                            <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Tiempo Est: <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{tiempoEstimadoMin} min</span></p>
                          </div>
                          <div className="text-right">
                            <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Tarifa Estimada</p>
                            <p className="text-lg font-black text-[#FF5722]">${tarifaTotal}</p>
                          </div>
                        </div>
                        <div className={`pt-2 border-t flex justify-between items-center ${darkMode ? 'border-slate-800 text-slate-300' : 'border-orange-200 text-slate-700'}`}>
                          <span className="text-[11px] font-bold">Equivalente BCV:</span>
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">Bs. {tarifaEnBolivares}</span>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={handleCrearPedido} 
                      disabled={enviandoPedido || !rutaCompletaLista} 
                      className={`w-full font-bold py-3.5 rounded-xl text-xs shadow-md transition ${
                        !rutaCompletaLista 
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600' 
                          : 'bg-[#FF5722] hover:bg-[#F4511E] text-white cursor-pointer'
                      }`}
                    >
                      {enviandoPedido ? 'Publicando...' : 'Publicar Pedido en el Radar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mapa grande y amplio */}
            <div className={`border rounded-3xl overflow-hidden shadow-sm h-[620px] relative ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
              <MapaMapbox
                coordsOrigen={coordsOrigen}
                coordsDestino={coordsDestino}
                coordsUsuario={coordsUsuarioGPS}
                modoSeleccion={modoSeleccionMapa}
                onMapClick={manejarClicEnMapa}
                onRutaCalculada={(km, min) => {
                  setDistanciaKm(km);
                  setTiempoEstimadoMin(min);
                }}
                mostrarRuta={rutaCompletaLista}
                mostrarPines={Boolean(coordsOrigen || coordsDestino || coordsUsuarioGPS)}
                darkMode={darkMode}
              />
            </div>
          </div>
        )}

        {activeTab === 'repartidor' && usuario && usuario.rol === 'repartidor' && (
          <div className="space-y-6 py-4">
            <div className={`border p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-800'}`}>
              <div>
                <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Radar de Trabajos en Carabobo</h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Gestiona tu estatus y acepta carreras cercanas.</p>
              </div>

              <div className="flex items-center space-x-4">
                <div className={`flex items-center space-x-2 px-4 py-2 rounded-2xl border text-xs font-bold ${repartidorOnline ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${repartidorOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                  <span>{repartidorOnline ? 'Conectado (Recibiendo Pedidos)' : 'Desconectado (Offline)'}</span>
                </div>
                
                {pedidoAsignadoRepartidor ? (
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/50">
                    🔒 Bloqueado (Carrera en curso)
                  </div>
                ) : (
                  <button
                    onClick={() => setRepartidorOnline(!repartidorOnline)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer shadow-sm ${
                      repartidorOnline ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <Power size={14} />
                    <span>{repartidorOnline ? 'Desconectarme' : 'Conectarme Online'}</span>
                  </button>
                )}
              </div>

              <div className={`border px-6 py-3 rounded-2xl text-center ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-200'}`}>
                <p className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ganancias Acumuladas</p>
                <p className="text-xl font-black text-[#FF5722]">${gananciasRepartidor}</p>
              </div>
            </div>

            {!repartidorOnline ? (
              <div className={`text-center py-20 border rounded-3xl space-y-3 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-800'}`}>
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <Power size={24} />
                </div>
                <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>Estás desconectado (Offline)</h3>
                <p className={`text-xs max-w-sm mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Conéctate arriba para comenzar a recibir solicitudes de entrega en tu radar de Carabobo.</p>
              </div>
            ) : pedidoAsignadoRepartidor ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={`border p-6 rounded-3xl shadow-sm space-y-5 ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-800'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                      Pedido #{pedidoAsignadoRepartidor.id} · En Curso ✓
                    </span>
                    <span className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>${pedidoAsignadoRepartidor.tarifa}</span>
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 p-4 rounded-2xl space-y-2">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">Datos del Cliente</p>
                    <div className="flex items-center space-x-3">
                      <img src={pedidoAsignadoRepartidor.cliente_foto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"} alt="Cliente" className="w-12 h-12 rounded-full object-cover border-2 border-emerald-600" />
                      <div>
                        <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{pedidoAsignadoRepartidor.cliente_nombre}</p>
                        <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Cédula: <span className="font-bold">{pedidoAsignadoRepartidor.cliente_cedula || 'V-00000000'}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className={`space-y-1 text-xs border p-3 rounded-2xl ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                    <p>🟢 <strong>Origen:</strong> {pedidoAsignadoRepartidor.origen_texto}</p>
                    <p>🔴 <strong>Destino:</strong> {pedidoAsignadoRepartidor.destino_texto}</p>
                    <p className={`text-[11px] pt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>📝 <em>{pedidoAsignadoRepartidor.descripcion}</em></p>
                  </div>

                  <div className={`border p-4 rounded-2xl space-y-3 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <h4 className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Chat con el Cliente</h4>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                      {mensajesChat.filter(m => m.pedido_id === pedidoAsignadoRepartidor.id).map((m) => (
                        <div key={m.id} className={`p-2 rounded-xl text-xs ${m.remitente_id === usuario.id ? (darkMode ? 'bg-orange-950/60 text-white ml-6' : 'bg-orange-100 text-slate-900 ml-6') : (darkMode ? 'bg-slate-900 border border-slate-800 text-slate-200 mr-6' : 'bg-white border border-slate-200 text-slate-800 mr-6')}`}>
                          <p className="font-bold text-[10px] text-[#FF5722]">{m.remitente_nombre}</p>
                          <p>{m.mensaje}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={nuevoMensajeTexto} onChange={e => setNuevoMensajeTexto(e.target.value)} placeholder="Escribe al cliente..." className={`flex-1 border rounded-xl px-3 py-2 text-xs ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200'}`} />
                      <button onClick={() => enviarMensaje(pedidoAsignadoRepartidor.id)} className="bg-[#FF5722] text-white p-2.5 rounded-xl cursor-pointer"><Send size={14} /></button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {pedidoAsignadoRepartidor.estado === 'entregado_repartidor' ? (
                      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3 rounded-xl text-center text-xs font-bold text-amber-800 dark:text-amber-300">
                        Esperando que el cliente confirme la recepción del paquete...
                      </div>
                    ) : (
                      <>
                        <button onClick={() => cambiarEstadoPedido(pedidoAsignadoRepartidor.id, 'entregado_repartidor')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs cursor-pointer shadow-md flex items-center justify-center space-x-2">
                          <CheckCircle size={16} />
                          <span>Marcar Paquete Entregado ✓</span>
                        </button>
                        <button onClick={() => cancelarPedidoActual(pedidoAsignadoRepartidor.id)} className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold py-2.5 rounded-xl text-xs cursor-pointer">
                          Cancelar Carrera
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className={`border rounded-3xl overflow-hidden shadow-sm h-[620px] relative ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-orange-100'}`}>
                  <MapaMapbox
                    coordsOrigen={{ lat: pedidoAsignadoRepartidor.origen_lat, lng: pedidoAsignadoRepartidor.origen_lon }}
                    coordsDestino={{ lat: pedidoAsignadoRepartidor.destino_lat, lng: pedidoAsignadoRepartidor.destino_lon }}
                    coordsUsuario={coordsUsuarioGPS}
                    mini={false}
                    mostrarRuta={true}
                    mostrarPines={true}
                    darkMode={darkMode}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pedidosVisiblesRepartidor.length === 0 ? (
                  <div className={`col-span-full text-center py-16 border rounded-3xl text-sm ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-orange-100 text-slate-800'}`}>
                    No hay pedidos activos disponibles en este momento.
                  </div>
                ) : (
                  pedidosVisiblesRepartidor.map((pedido) => {
                    const yaPostulado = Array.isArray(postulacionesReales) && postulacionesReales.some(p => p.pedido_id === pedido.id && p.repartidor_id === usuario.id);
                    const soyAsignado = pedido.repartidor_id === usuario.id;

                    return (
                      <div key={pedido.id} className={`border p-5 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-800'}`}>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-orange-100 text-[#FF5722]">
                              {pedido.tipo_servicio} · {pedido.distancia_km} km
                            </span>
                            <span className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>${pedido.tarifa}</span>
                          </div>

                          <div className={`w-full h-36 rounded-2xl overflow-hidden border ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                            <MapaMapbox
                              coordsOrigen={{ lat: pedido.origen_lat, lng: pedido.origen_lon }}
                              coordsDestino={{ lat: pedido.destino_lat, lng: pedido.destino_lon }}
                              mini={true}
                              mostrarRuta={true}
                              mostrarPines={true}
                              darkMode={darkMode}
                            />
                          </div>

                          <div className="flex items-center space-x-3 pt-1">
                            <img src={pedido.cliente_foto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"} alt="Cliente" className="w-9 h-9 rounded-full object-cover border-2 border-[#FF5722]" />
                            <div>
                              <p className={`text-xs font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{pedido.cliente_nombre}</p>
                              <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Cliente Verificado</p>
                            </div>
                          </div>

                          <div className={`space-y-1 text-xs border p-3 rounded-2xl ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                            <p className="truncate">🟢 <strong>Origen:</strong> {pedido.origen_texto}</p>
                            <p className="truncate">🔴 <strong>Destino:</strong> {pedido.destino_texto}</p>
                            <p className={`text-[11px] pt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>📝 <em>{pedido.descripcion}</em></p>
                          </div>
                        </div>

                        <div className={`pt-2 border-t ${darkMode ? 'border-slate-800' : 'border-orange-100'}`}>
                          {soyAsignado ? (
                            <div className="space-y-3">
                              <div className="bg-emerald-50 text-emerald-800 p-2 rounded-xl text-center text-xs font-bold">
                                ¡Pedido Asignado a Ti! ✓
                              </div>
                              <button onClick={() => cambiarEstadoPedido(pedido.id, 'completado')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer">
                                Marcar como Completado
                              </button>
                            </div>
                          ) : yaPostulado ? (
                            <div className="bg-amber-50 text-amber-800 p-2.5 rounded-xl text-center text-xs font-bold">
                              Postulación Enviada (Esperando al cliente)
                            </div>
                          ) : (
                            <button onClick={() => postularsePedido(pedido.id)} className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white text-xs font-bold py-3 rounded-xl cursor-pointer shadow-sm">
                              Postularme para este servicio
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}