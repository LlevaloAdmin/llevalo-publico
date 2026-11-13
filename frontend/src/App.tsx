import React, { useState, useEffect, useRef } from 'react';
import { Bike, MapPin, ArrowRight, User, Eye, EyeOff, CheckCircle2, Clock, MessageSquare, Send, Star, AlertCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  estado: 'pendiente' | 'postulado' | 'aceptado' | 'completado' | 'cancelado';
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
  rol: 'cliente' | 'repartidor';
}

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'cliente' | 'repartidor' | 'perfil' | 'auth'>('home');
  const [serviceType, setServiceType] = useState<'comida' | 'mercado' | 'mandados' | 'viajes'>('comida');
  
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authRoleSelection, setAuthRoleSelection] = useState<'cliente' | 'repartidor'>('cliente');
  const [cargandoAuth, setCargandoAuth] = useState(false);
  const [errorAuth, setErrorAuth] = useState('');

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
  const [origenInput, setOrigenInput] = useState('');
  const [coordsOrigen, setCoordsOrigen] = useState<{ lat: number; lon: number } | null>(null);
  const [destinoInput, setDestinoInput] = useState('');
  const [coordsDestino, setCoordsDestino] = useState<{ lat: number; lon: number } | null>(null);

  const [sugerenciasOrigen, setSugerenciasOrigen] = useState<any[]>([]);
  const [sugerenciasDestino, setSugerenciasDestino] = useState<any[]>([]);
  const [activoParaColocar, setActivoParaColocar] = useState<'origen' | 'destino' | null>(null);
  const activoRef = useRef<'origen' | 'destino' | null>(null);
  activoRef.current = activoParaColocar;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [distanciaKm, setDistanciaKm] = useState<number>(3.5);
  const [tiempoEstimadoMin, setTiempoEstimadoMin] = useState<number>(10);
  
  const costoPorKm = serviceType === 'viajes' ? 0.80 : 0.50; 
  const tarifaTotal = Math.max(1.5, distanciaKm * costoPorKm).toFixed(2);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [pedidosReales, setPedidosReales] = useState<PedidoReal[]>([]);
  const [postulacionesReales, setPostulacionesReales] = useState<Postulacion[]>([]);
  const [mensajesChat, setMensajesChat] = useState<MensajeChat[]>([]);
  const [nuevoMensajeTexto, setNuevoMensajeTexto] = useState('');
  const [calificacionEstrellas, setCalificacionEstrellas] = useState(5);
  const [calificacionEnviada, setCalificacionEnviada] = useState(false);

  useEffect(() => {
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
  }, []);

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

  useEffect(() => {
    if (activeTab === 'cliente' && mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([10.2291, -68.0055], 13);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);

      map.on('click', (e: L.LeafletMouseEvent) => {
        const modo = activoRef.current;
        if (modo === 'origen') {
          setCoordsOrigen({ lat: e.latlng.lat, lon: e.latlng.lng });
          setOrigenInput(`Pin (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`);
          setSugerenciasOrigen([]);
          setActivoParaColocar(null);
        } else if (modo === 'destino') {
          setCoordsDestino({ lat: e.latlng.lat, lon: e.latlng.lng });
          setDestinoInput(`Pin (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`);
          setSugerenciasDestino([]);
          setActivoParaColocar(null);
        }
      });
    }
    return () => {
      if (activeTab !== 'cliente' && mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, [activeTab]);

  useEffect(() => {
    if (mapContainerRef.current) {
      mapContainerRef.current.style.cursor = activoParaColocar ? 'crosshair' : '';
    }
  }, [activoParaColocar]);

  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    const layerGroup = markersLayerRef.current;
    layerGroup.clearLayers();

    const latOrig = coordsOrigen ? coordsOrigen.lat : 10.2291;
    const lonOrig = coordsOrigen ? coordsOrigen.lon : -68.0055;
    const latDest = coordsDestino ? coordsDestino.lat : (10.2291 + 0.02);
    const lonDest = coordsDestino ? coordsDestino.lon : (-68.0055 + 0.02);

    if (coordsOrigen) {
      layerGroup.addLayer(L.marker([coordsOrigen.lat, coordsOrigen.lon], { icon: L.divIcon({ className: '', html: '<div style="background:#10B981; width:22px; height:22px; border-radius:50%; border:3px solid white;"></div>' }) }));
    }
    if (coordsDestino) {
      layerGroup.addLayer(L.marker([coordsDestino.lat, coordsDestino.lon], { icon: L.divIcon({ className: '', html: '<div style="background:#EF4444; width:22px; height:22px; border-radius:50%; border:3px solid white;"></div>' }) }));
    }

    let cancelado = false;
    const calcularRuta = async () => {
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${lonOrig},${latOrig};${lonDest},${latDest}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (cancelado || !mapRef.current) return;
        if (data.code === 'Ok' && data.routes?.length > 0) {
          const ruta = data.routes[0];
          const coords = ruta.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
          const polyline = L.polyline(coords, { color: '#FF5722', weight: 5, opacity: 0.95 });
          layerGroup.addLayer(polyline);
          mapRef.current.fitBounds(polyline.getBounds(), { padding: [60, 60] });
          setDistanciaKm(Math.max(0.5, Number((ruta.distance / 1000).toFixed(1))));
          setTiempoEstimadoMin(Math.max(3, Math.round(ruta.duration / 60)));
        }
      } catch (e) { 
        // Fallback matemático si OSRM falla
        setDistanciaKm(3.5);
        setTiempoEstimadoMin(10);
      }
    };
    calcularRuta();
    return () => { cancelado = true; };
  }, [coordsOrigen, coordsDestino]);

 const buscarDireccion = (query: string, tipo: 'origen' | 'destino') => {
    if (tipo === 'origen') {
      setOrigenInput(query);
      if (!query.trim()) { setSugerenciasOrigen([]); return; }
    } else {
      setDestinoInput(query);
      if (!query.trim()) { setSugerenciasDestino([]); return; }
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        // Búsqueda ampliada enfocada en Carabobo, calles, urbanizaciones y puntos de referencia
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ve&viewbox=-68.15,10.10,-67.85,10.35&bounded=1&accept-language=es&q=${encodeURIComponent(query + ', San Diego, Carabobo')}&limit=6`;
        const res = await fetch(url);
        const data = await res.json();
        if (tipo === 'origen') setSugerenciasOrigen(Array.isArray(data) ? data : []);
        else setSugerenciasDestino(Array.isArray(data) ? data : []);
      } catch (e) { console.error(e); }
    }, 300);
  };
  
  const handleCrearPedido = async () => {
    if (!usuario) return;
    setEnviandoPedido(true);
    
    const finalLatO = coordsOrigen ? coordsOrigen.lat : 10.2291;
    const finalLonO = coordsOrigen ? coordsOrigen.lon : -68.0055;
    const finalLatD = coordsDestino ? coordsDestino.lat : 10.2491;
    const finalLonD = coordsDestino ? coordsDestino.lon : -68.0255;
    const finalOrigText = origenInput || 'San Diego, Carabobo';
    const finalDestText = destinoInput || 'Destino en Carabobo';

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
          origen_texto: finalOrigText, origen_lat: finalLatO, origen_lon: finalLonO,
          destino_texto: finalDestText, destino_lat: finalLatD, destino_lon: finalLonD,
          distancia_km: distanciaKm, tiempo_min: tiempoEstimadoMin, tarifa: tarifaTotal
        })
      });
      if (!res.ok) throw new Error('Error al publicar');
      setDescripcionPedido('');
      await sincronizarDatos();
    } catch (err: any) { alert(err.message); }
    finally { setEnviandoPedido(false); }
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
          calificacion: 4.9
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

  const cambiarEstadoPedido = async (pedidoId: number, nuevoEstado: 'completado' | 'cancelado') => {
    try {
      await fetch(`${API_URL}/api/pedidos/${pedidoId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevo_estado: nuevoEstado })
      });
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
    ? pedidosReales.filter(p => p.estado === 'pendiente' || p.estado === 'postulado' || (p.estado === 'aceptado' && p.repartidor_id === usuario.id))
    : [];

  const gananciasRepartidor = usuario?.rol === 'repartidor' && Array.isArray(pedidosReales)
    ? pedidosReales.filter(p => p.repartidor_id === usuario.id && p.estado === 'completado').reduce((a, b) => a + parseFloat(b.tarifa), 0).toFixed(2)
    : '0.00';

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 flex flex-col font-sans">
      <header className="border-b border-orange-100 bg-[#FDFBF7]/90 backdrop-blur sticky top-0 z-50 px-6 md:px-10 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('home')}>
          <div className="bg-[#FF5722] text-white w-10 h-10 rounded-xl font-black text-xl flex items-center justify-center shadow-md">L</div>
          <span className="text-2xl font-black tracking-tight text-slate-900">Llévalo</span>
        </div>
        
        <nav className="hidden md:flex space-x-1.5 bg-orange-50/80 p-1.5 rounded-2xl border border-orange-100">
          <button onClick={() => setActiveTab('home')} className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer ${activeTab === 'home' ? 'bg-[#FF5722] text-white' : 'text-slate-600'}`}>Inicio</button>
          {usuario && usuario.rol === 'cliente' && <button onClick={() => setActiveTab('cliente')} className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer ${activeTab === 'cliente' ? 'bg-[#FF5722] text-white' : 'text-slate-600'}`}>Pedir</button>}
          {usuario && usuario.rol === 'repartidor' && <button onClick={() => setActiveTab('repartidor')} className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer ${activeTab === 'repartidor' ? 'bg-[#FF5722] text-white' : 'text-slate-600'}`}>Radar de Trabajos</button>}
        </nav>

        <div className="flex items-center space-x-3">
          {usuario ? (
            <div className="flex items-center space-x-3">
              {fotoLocal ? (
                <img src={fotoLocal} alt="Avatar" className="w-9 h-9 rounded-full object-cover border-2 border-[#FF5722]" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-orange-100 text-[#FF5722] flex items-center justify-center font-bold text-xs">
                  {usuario.nombre ? usuario.nombre.substring(0, 2).toUpperCase() : 'U'}
                </div>
              )}
              <div className="text-right hidden sm:block cursor-pointer" onClick={() => setActiveTab('perfil')}>
                <p className="text-xs font-black text-slate-900 hover:underline">{usuario.nombre}</p>
                <p className="text-[10px] font-bold text-[#FF5722] uppercase">{usuario.rol} · Mi Perfil</p>
              </div>
              <button onClick={handleLogout} className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-200 cursor-pointer">Salir</button>
            </div>
          ) : (
            <button onClick={() => { setErrorAuth(''); setActiveTab('auth'); }} className="flex items-center space-x-2 bg-white hover:bg-orange-50 border border-orange-200 px-5 py-2.5 rounded-2xl transition text-sm font-bold shadow-sm cursor-pointer">
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
              <div className="inline-flex items-center space-x-2 bg-lime-200/70 border border-lime-300 px-4 py-1.5 rounded-full text-slate-900 text-xs font-bold uppercase">
                <MapPin size={14} className="text-emerald-700" />
                <span>Carabobo, Venezuela 🇻🇪</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tight leading-[1.08] text-slate-900">
                Lo que necesites, <span className="text-[#FF5722]">llévalo ya.</span>
              </h1>
              <p className="text-slate-600 text-lg leading-relaxed max-w-xl">
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
                  <button onClick={() => { if (!usuario) { setAuthRoleSelection('repartidor'); setActiveTab('auth'); } else setActiveTab('repartidor'); }} className="bg-white hover:bg-orange-50 border border-orange-200 text-slate-800 font-bold px-8 py-4 rounded-2xl transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer">
                    <Bike size={18} className="text-[#FF5722]" />
                    <span>Quiero ser repartidor</span>
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <div className="bg-orange-100 rounded-3xl overflow-hidden shadow-xl border border-orange-200 p-2">
                <img src="https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80" alt="Repartidor urbano con moto y caja" className="rounded-2xl object-cover w-full h-[430px]" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'perfil' && usuario && (
          <div className="max-w-xl mx-auto w-full py-6">
            <div className="bg-white border border-orange-100 p-8 rounded-3xl shadow-sm space-y-6">
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
                  <h2 className="text-2xl font-black text-slate-900">{usuario.nombre}</h2>
                  <p className="text-xs font-bold text-[#FF5722] uppercase">Rol: {usuario.rol} · Verificado ✓</p>
                </div>
              </div>

              <form onSubmit={guardarPerfil} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">Foto de Perfil (Dispositivo)</label>
                  <input type="file" accept="image/*" onChange={(e) => convertirImagenSegura(e, setFotoLocal)} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-[#FF5722] hover:file:bg-orange-100 mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Cédula de Identidad</label>
                  <input type="text" value={cedula} onChange={e => validarCedulaFormato(e.target.value)} placeholder="Ej. V-28123456" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm mt-1" />
                  {errorCedula && <p className="text-[10px] text-red-600 font-bold mt-1">{errorCedula}</p>}
                </div>

                {usuario.rol === 'repartidor' && (
                  <div className="space-y-4 pt-2 border-t border-orange-100">
                    <h3 className="font-bold text-sm text-slate-900">Datos de tu Vehículo</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700">Tipo / Modelo</label>
                        <select value={tipoVehiculo} onChange={e => setTipoVehiculo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs mt-1">
                          <option value="Moto Suzuki GN">Moto (Suzuki / Keeway)</option>
                          <option value="Carro Sedán">Carro Sedán</option>
                          <option value="Camioneta Pickup">Camioneta / SUV</option>
                          <option value="Camión Carga">Camión de Carga</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700">Placa</label>
                        <input type="text" value={placaVehiculo} onChange={e => validarPlacaFormato(e.target.value)} placeholder="Ej. AB123CD" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs mt-1" />
                        {errorPlaca && <p className="text-[10px] text-red-600 font-bold mt-1">{errorPlaca}</p>}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700">Foto del Vehículo (Dispositivo)</label>
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
            <div className="lg:col-span-1 bg-white border border-orange-100 p-6 rounded-3xl shadow-sm space-y-5 relative">
              {pedidoActivoCliente ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-orange-100 text-[#FF5722]">
                      Pedido #{pedidoActivoCliente.id} · {pedidoActivoCliente.tipo_servicio}
                    </span>
                    <span className="text-lg font-black text-slate-900">${pedidoActivoCliente.tarifa}</span>
                  </div>

                  {pedidoActivoCliente.estado === 'pendiente' || pedidoActivoCliente.estado === 'postulado' ? (
                    <div className="space-y-3">
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-1">
                        <div className="flex items-center space-x-2 text-amber-800 font-bold text-sm">
                          <Clock size={18} className="animate-spin" />
                          <span>Postulaciones de repartidores</span>
                        </div>
                        <p className="text-xs text-amber-700">Compara la foto del repartidor y la foto de su vehículo antes de aceptar.</p>
                      </div>

                      {postulacionesPedidoActual.length === 0 ? (
                        <div className="text-center p-6 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-500">
                          Buscando repartidores cercanos en Carabobo...
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {postulacionesPedidoActual.map((post) => (
                            <div key={post.id} className="bg-slate-50 border border-orange-200 p-3 rounded-2xl flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-1">
                                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" alt="Repartidor" className="w-10 h-10 rounded-full object-cover border-2 border-[#FF5722]" />
                                  {post.vehiculo_foto && (
                                    <img src={post.vehiculo_foto} alt="Vehículo" className="w-10 h-10 rounded-xl object-cover border-2 border-slate-300" title="Vehículo" />
                                  )}
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-xs font-black text-slate-900">{post.repartidor_nombre}</p>
                                  <p className="text-[10px] text-slate-600">{post.vehiculo} ({post.placa})</p>
                                  <p className="text-[10px] font-bold text-amber-600">★ {post.calificacion}</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => aceptarPostulacion(pedidoActivoCliente.id, post)}
                                className="bg-[#FF5722] hover:bg-[#F4511E] text-white text-xs font-bold px-3 py-2 rounded-xl shadow cursor-pointer"
                              >
                                Aceptar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl space-y-2">
                        <div className="flex items-center space-x-2 text-emerald-800 font-bold text-sm">
                          <CheckCircle2 size={18} />
                          <span>¡Conductor Asignado!</span>
                        </div>
                        <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-emerald-200">
                          <div className="flex items-center space-x-1">
                            <img src={pedidoActivoCliente.repartidor_foto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"} alt="Repartidor" className="w-11 h-11 rounded-full object-cover border-2 border-[#FF5722]" />
                            {pedidoActivoCliente.repartidor_vehiculo_foto && (
                              <img src={pedidoActivoCliente.repartidor_vehiculo_foto} alt="Vehículo" className="w-11 h-11 rounded-xl object-cover border-2 border-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900">{pedidoActivoCliente.repartidor_nombre}</p>
                            <p className="text-[11px] text-slate-600">{pedidoActivoCliente.repartidor_vehiculo} · <strong>{pedidoActivoCliente.repartidor_placa}</strong></p>
                            <p className="text-[10px] text-amber-600 font-bold">★ {pedidoActivoCliente.repartidor_calificacion}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2">
                        <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <MessageSquare size={14} className="text-[#FF5722]" /> Chat privado en vivo
                        </p>
                        <div className="h-32 overflow-y-auto bg-white border border-slate-200 rounded-xl p-2 space-y-1 text-xs">
                          {mensajesChat.filter(m => m.pedido_id === pedidoActivoCliente.id).map(msg => (
                            <div key={msg.id} className={`p-1.5 rounded-lg max-w-[85%] ${msg.remitente_id === usuario.id ? 'bg-orange-100 ml-auto text-slate-900' : 'bg-slate-100 mr-auto text-slate-800'}`}>
                              <p className="text-[10px] font-bold text-[#FF5722]">{msg.remitente_nombre}</p>
                              <p>{msg.mensaje}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <input 
                            type="text" 
                            value={nuevoMensajeTexto}
                            onChange={(e) => setNuevoMensajeTexto(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && enviarMensaje(pedidoActivoCliente.id)}
                            placeholder="Mensaje..."
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#FF5722]"
                          />
                          <button onClick={() => enviarMensaje(pedidoActivoCliente.id)} className="bg-[#FF5722] text-white p-2 rounded-xl cursor-pointer"><Send size={14} /></button>
                        </div>
                      </div>

                      <div className="bg-white border border-orange-100 p-3 rounded-2xl space-y-2 text-center">
                        <p className="text-xs font-bold text-slate-800">Califica tu experiencia</p>
                        <div className="flex justify-center gap-1 text-amber-500 cursor-pointer">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star key={star} size={20} fill={star <= calificacionEstrellas ? 'currentColor' : 'none'} onClick={() => setCalificacionEstrellas(star)} />
                          ))}
                        </div>
                        <button 
                          onClick={() => { setCalificacionEnviada(true); cambiarEstadoPedido(pedidoActivoCliente.id, 'completado'); }}
                          disabled={calificacionEnviada}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition cursor-pointer"
                        >
                          {calificacionEnviada ? '✓ ¡Calificación guardada!' : 'Finalizar y Calificar'}
                        </button>
                      </div>
                    </div>
                  )}

                  <button onClick={() => cambiarEstadoPedido(pedidoActivoCliente.id, 'cancelado')} className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold py-2 rounded-xl text-xs cursor-pointer">
                    Cancelar Pedido
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-black text-slate-900">¿Qué necesitas?</h2>

                  <div className="grid grid-cols-4 gap-2 bg-orange-50/50 p-1.5 rounded-2xl border border-orange-100">
                    {(['comida', 'mercado', 'mandados', 'viajes'] as const).map((type) => (
                      <button key={type} onClick={() => setServiceType(type)} className={`py-3 rounded-xl text-xs font-bold capitalize transition flex flex-col items-center space-y-1 cursor-pointer ${serviceType === type ? 'bg-white border-2 border-[#FF5722] text-[#FF5722]' : 'text-slate-600'}`}>
                        <span>{type === 'comida' ? '🍔' : type === 'mercado' ? '🛒' : type === 'mandados' ? '📦' : '🚗'}</span>
                        <span>{type}</span>
                      </button>
                    ))}
                  </div>

                  <input 
                    type="text" 
                    value={descripcionPedido}
                    onChange={(e) => setDescripcionPedido(e.target.value)}
                    placeholder="Detalle del pedido o destino..." 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF5722]" 
                  />

                  <div className="space-y-3 relative">
                    <div className={`p-3 rounded-2xl border bg-slate-50/60 space-y-1 relative transition-all ${activoParaColocar === 'origen' ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700">Recoger en</label>
                        <button type="button" onClick={() => setActivoParaColocar(activoParaColocar === 'origen' ? null : 'origen')} className="w-5 h-5 bg-emerald-500 rounded-full inline-block shadow-md border-2 border-white cursor-pointer" title="Marcar en el mapa"></button>
                      </div>
                      <input type="text" value={origenInput} onChange={(e) => buscarDireccion(e.target.value, 'origen')} placeholder="Dirección origen" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                      {sugerenciasOrigen.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-40 overflow-y-auto">
                          {sugerenciasOrigen.map((item, idx) => (
                            <div key={idx} onClick={() => { setOrigenInput(item.display_name); setCoordsOrigen({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) }); setSugerenciasOrigen([]); }} className="p-2 text-xs hover:bg-orange-50 cursor-pointer border-b">
                              {item.display_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={`p-3 rounded-2xl border bg-slate-50/60 space-y-1 relative transition-all ${activoParaColocar === 'destino' ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/30' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700">Entregar en</label>
                        <button type="button" onClick={() => setActivoParaColocar(activoParaColocar === 'destino' ? null : 'destino')} className="w-5 h-5 bg-red-500 rounded-full inline-block shadow-md border-2 border-white cursor-pointer" title="Marcar en el mapa"></button>
                      </div>
                      <input type="text" value={destinoInput} onChange={(e) => buscarDireccion(e.target.value, 'destino')} placeholder="Dirección destino" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                      {sugerenciasDestino.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-40 overflow-y-auto">
                          {sugerenciasDestino.map((item, idx) => (
                            <div key={idx} onClick={() => { setDestinoInput(item.display_name); setCoordsDestino({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) }); setSugerenciasDestino([]); }} className="p-2 text-xs hover:bg-orange-50 cursor-pointer border-b">
                              {item.display_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-900 text-white p-4 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="text-[11px] text-slate-400">Distancia y Tiempo aprox.</p>
                      <p className="text-base font-black">{distanciaKm} km · ~{tiempoEstimadoMin} min</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400">Total a pagar</p>
                      <p className="text-2xl font-black text-lime-400">${tarifaTotal}</p>
                    </div>
                  </div>

                  <button onClick={handleCrearPedido} disabled={enviandoPedido} className={`w-full font-bold py-4 rounded-2xl transition shadow-lg ${enviandoPedido ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white cursor-pointer'}`}>
                    {enviandoPedido ? 'Publicando...' : `Pedir ${serviceType}`}
                  </button>
                </>
              )}
            </div>

            <div className="lg:col-span-2 border border-orange-200 rounded-3xl overflow-hidden relative min-h-[500px]">
              <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />
            </div>
          </div>
        )}

        {activeTab === 'repartidor' && usuario && usuario.rol === 'repartidor' && (
          <div className="max-w-4xl mx-auto w-full py-6 space-y-6">
            <div className="bg-white border border-orange-100 p-8 rounded-3xl shadow-sm flex justify-between items-center">
              <div>
                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">● Radar en Tiempo Real</span>
                <h2 className="text-3xl font-black text-slate-900 mt-2">Hola, {usuario.nombre} 🛵</h2>
                <p className="text-xs text-slate-500">Vehículo: <strong className="text-[#FF5722]">{usuario.vehiculo}</strong> ({usuario.placa})</p>
              </div>
              <div className="bg-orange-50 px-5 py-3 rounded-2xl text-right">
                <p className="text-xs text-slate-500">Ganancias</p>
                <p className="text-2xl font-black text-emerald-600">${gananciasRepartidor}</p>
              </div>
            </div>

            <h3 className="text-xl font-black text-slate-900">Solicitudes Disponibles</h3>
            
            {pedidosVisiblesRepartidor.length === 0 ? (
              <div className="bg-white border border-orange-100 p-10 rounded-3xl text-center text-slate-500 text-sm">
                No hay pedidos en este momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pedidosVisiblesRepartidor.map((pedido) => {
                  const miPostulacion = postulacionesReales.find(p => p.pedido_id === pedido.id && p.repartidor_id === usuario.id);
                  const fuiAceptado = pedido.estado === 'aceptado' && pedido.repartidor_id === usuario.id;
                  const fuiRechazado = miPostulacion && miPostulacion.estado === 'rechazado';

                  return (
                    <div key={pedido.id} className="bg-white border border-orange-100 p-6 rounded-3xl shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold uppercase text-[#FF5722]">{pedido.tipo_servicio} · Cliente: {pedido.cliente_nombre}</span>
                          <h4 className="font-bold text-base text-slate-900 mt-1">{pedido.descripcion}</h4>
                        </div>
                        <span className="bg-orange-100 text-[#FF5722] font-black px-3 py-1 rounded-xl text-sm">${pedido.tarifa}</span>
                      </div>
                      
                      <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl space-y-1">
                        <p><strong>Recoger:</strong> {pedido.origen_texto}</p>
                        <p><strong>Entregar:</strong> {pedido.destino_texto}</p>
                        <p><strong>Distancia:</strong> {pedido.distancia_km} km (~{pedido.tiempo_min} mins)</p>
                      </div>

                      {fuiAceptado ? (
                        <div className="space-y-3">
                          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs font-bold text-emerald-800 flex justify-between items-center">
                            <span>🎉 ¡Fuiste aceptado!</span>
                            <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">EN CURSO</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2">
                            <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              <MessageSquare size={14} className="text-[#FF5722]" /> Chat con el cliente
                            </p>
                            <div className="h-28 overflow-y-auto bg-white border border-slate-200 rounded-xl p-2 space-y-1 text-xs">
                              {mensajesChat.filter(m => m.pedido_id === pedido.id).map(msg => (
                                <div key={msg.id} className={`p-1.5 rounded-lg max-w-[85%] ${msg.remitente_id === usuario.id ? 'bg-orange-100 ml-auto text-slate-900' : 'bg-slate-100 mr-auto text-slate-800'}`}>
                                  <p className="text-[10px] font-bold text-[#FF5722]">{msg.remitente_nombre}</p>
                                  <p>{msg.mensaje}</p>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <input 
                                type="text" 
                                value={nuevoMensajeTexto}
                                onChange={(e) => setNuevoMensajeTexto(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && enviarMensaje(pedido.id)}
                                placeholder="Mensaje..."
                                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#FF5722]"
                              />
                              <button onClick={() => enviarMensaje(pedido.id)} className="bg-[#FF5722] text-white p-2 rounded-xl cursor-pointer"><Send size={14} /></button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => cambiarEstadoPedido(pedido.id, 'completado')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer">✓ Entregado</button>
                            <button onClick={() => cambiarEstadoPedido(pedido.id, 'cancelado')} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold py-2.5 rounded-xl text-xs cursor-pointer">Cancelar</button>
                          </div>
                        </div>
                      ) : fuiRechazado ? (
                        <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                          <AlertCircle size={16} />
                          <span>El cliente seleccionó a otro repartidor. ¡Intenta con el siguiente!</span>
                        </div>
                      ) : miPostulacion ? (
                        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs font-bold text-blue-800 text-center">
                          ⏳ Postulado. Esperando respuesta del cliente...
                        </div>
                      ) : (
                        <button onClick={() => postularsePedido(pedido.id)} className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white font-bold py-3 rounded-xl transition cursor-pointer">
                          Postularme a este pedido
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'auth' && (
          <div className="max-w-md mx-auto w-full py-6">
            <div className="bg-white border border-orange-100 p-8 rounded-3xl shadow-sm space-y-6">
              <div className="text-center space-y-2">
                <div className="bg-[#FF5722] text-white w-12 h-12 rounded-2xl font-black text-2xl flex items-center justify-center mx-auto shadow-md">L</div>
                <h2 className="text-2xl font-black text-slate-900">Acceso a Llévalo</h2>
              </div>

              <div className="flex bg-orange-50 p-1.5 rounded-2xl border border-orange-100">
                <button type="button" onClick={() => { setAuthMode('login'); setErrorAuth(''); }} className={`flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Entrar</button>
                <button type="button" onClick={() => { setAuthMode('register'); setErrorAuth(''); }} className={`flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${authMode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Registrarme</button>
              </div>

              {authMode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setAuthRoleSelection('cliente')} className={`py-2.5 rounded-2xl text-xs font-bold border-2 cursor-pointer ${authRoleSelection === 'cliente' ? 'border-[#FF5722] bg-orange-50/50' : 'border-slate-200 text-slate-500'}`}>👤 Cliente</button>
                  <button type="button" onClick={() => setAuthRoleSelection('repartidor')} className={`py-2.5 rounded-2xl text-xs font-bold border-2 cursor-pointer ${authRoleSelection === 'repartidor' ? 'border-[#FF5722] bg-orange-50/50' : 'border-slate-200 text-slate-500'}`}>🛵 Repartidor</button>
                </div>
              )}

              {errorAuth && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold">{errorAuth}</div>}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <>
                    <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellido" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
                    
                    <div>
                      <label className="text-xs font-bold text-slate-700">Cédula de Identidad (Verificación)</label>
                      <input type="text" required value={cedula} onChange={e => validarCedulaFormato(e.target.value)} placeholder="Ej. V-28123456" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" />
                      {errorCedula && <p className="text-[10px] text-red-600 font-bold mt-1">{errorCedula}</p>}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700">Foto de perfil (Dispositivo)</label>
                      <input type="file" accept="image/*" onChange={(e) => convertirImagenSegura(e, setFotoLocal)} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-[#FF5722] hover:file:bg-orange-100 mt-1" />
                    </div>

                    {authRoleSelection === 'repartidor' && (
                      <div className="space-y-3 pt-2 border-t border-orange-100">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-bold text-slate-700">Tipo de Vehículo</label>
                            <select value={tipoVehiculo} onChange={e => setTipoVehiculo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs mt-1">
                              <option value="Moto Suzuki GN">Moto (Suzuki / Keeway)</option>
                              <option value="Carro Sedán">Carro Sedán</option>
                              <option value="Camioneta Pickup">Camioneta / SUV</option>
                              <option value="Camión Carga">Camión de Carga</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-700">Placa Vehicular</label>
                            <input type="text" required value={placaVehiculo} onChange={e => validarPlacaFormato(e.target.value)} placeholder="Ej. AB123CD" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs mt-1" />
                            {errorPlaca && <p className="text-[10px] text-red-600 font-bold mt-1">{errorPlaca}</p>}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700">Foto del Vehículo (Dispositivo)</label>
                          <input type="file" accept="image/*" onChange={(e) => convertirImagenSegura(e, setFotoVehiculoLocal)} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-[#FF5722] hover:file:bg-orange-100 mt-1" />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo electrónico" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
                
                <div className="relative">
                  <input type={mostrarPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm" />
                  <button type="button" onClick={() => setMostrarPassword(!mostrarPassword)} className="absolute right-3 top-2.5 text-slate-400 cursor-pointer">
                    {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <button type="submit" disabled={Boolean(errorCedula || errorPlaca)} className={`w-full font-bold py-3.5 rounded-xl cursor-pointer shadow-md ${errorCedula || errorPlaca ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#F4511E] text-white'}`}>
                  {authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta Verificada'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}