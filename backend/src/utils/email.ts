import axios from 'axios';

type RelayResponse = {
  ok: boolean;
  error?: string;
};

const obtenerConfiguracionCorreo = () => {
  const relayUrl = process.env.GMAIL_RELAY_URL?.trim();
  const relaySecret = process.env.GMAIL_RELAY_SECRET?.trim();
  const frontendUrl = process.env.FRONTEND_URL?.trim() || 'https://llevalo.vercel.app';

  if (!relayUrl || !relaySecret) {
    throw new Error('El envío de correo no está configurado.');
  }

  let relay: URL;
  let frontend: URL;
  try {
    relay = new URL(relayUrl);
    frontend = new URL(frontendUrl);
  } catch {
    throw new Error('La URL de correo o del frontend no es válida.');
  }

  if (
    relay.protocol !== 'https:'
    || relay.hostname !== 'script.google.com'
    || !relay.pathname.startsWith('/macros/s/')
    || !relay.pathname.endsWith('/exec')
  ) {
    throw new Error('GMAIL_RELAY_URL debe ser la URL HTTPS publicada de Google Apps Script.');
  }

  const origenLocal = frontend.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(frontend.hostname);
  if (frontend.protocol !== 'https:' && !origenLocal) {
    throw new Error('FRONTEND_URL debe usar HTTPS.');
  }

  return {
    relayUrl: relay.toString(),
    relaySecret,
    frontendUrl: frontend.origin
  };
};

const parsearRespuestaRelay = (data: unknown): RelayResponse => {
  let respuesta = data;
  if (typeof respuesta === 'string') {
    try {
      respuesta = JSON.parse(respuesta) as unknown;
    } catch {
      throw new Error('Google Apps Script devolvió una respuesta inválida.');
    }
  }

  if (
    typeof respuesta !== 'object'
    || respuesta === null
    || !('ok' in respuesta)
    || typeof respuesta.ok !== 'boolean'
  ) {
    throw new Error('Google Apps Script devolvió una respuesta inválida.');
  }

  return {
    ok: respuesta.ok,
    error: 'error' in respuesta && typeof respuesta.error === 'string' ? respuesta.error : undefined
  };
};

const enviarCorreo = async (
  destinatario: string,
  asunto: string,
  texto: string,
  html?: string
): Promise<void> => {
  const { relayUrl, relaySecret } = obtenerConfiguracionCorreo();
  const response = await axios.post<unknown>(
    relayUrl,
    {
      secret: relaySecret,
      to: destinatario,
      subject: asunto,
      text: texto,
      html
    },
    {
      timeout: 20_000,
      headers: { 'Content-Type': 'application/json' }
    }
  );
  const resultado = parsearRespuestaRelay(response.data);
  if (!resultado.ok) {
    throw new Error(resultado.error || 'Google Apps Script no pudo enviar el correo.');
  }
};

const crearEnlace = (frontendUrl: string, accion: string, token: string) => {
  const url = new URL('/', frontendUrl);
  const fragmento = new URLSearchParams({ accionCorreo: accion, tokenCorreo: token });
  url.hash = fragmento.toString();
  return url.toString();
};

const enviarCorreoAccion = (
  destinatario: string,
  asunto: string,
  titulo: string,
  descripcion: string,
  textoBoton: string,
  accion: string,
  token: string
): Promise<void> => {
  const { frontendUrl } = obtenerConfiguracionCorreo();
  const enlace = crearEnlace(frontendUrl, accion, token);
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a"><h1 style="color:#ff5722">${titulo}</h1><p>${descripcion}</p><p><a href="${enlace}" style="display:inline-block;background:#ff5722;color:white;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${textoBoton}</a></p><p>Si no solicitaste esta acción, puedes ignorar este mensaje.</p><p style="font-size:12px;color:#64748b">El enlace es personal y vence en 30 minutos.</p></div>`;
  const texto = `${titulo}\n\n${descripcion}\n\n${textoBoton}: ${enlace}\n\nEl enlace es personal y vence en 30 minutos.`;
  return enviarCorreo(destinatario, asunto, texto, html);
};

export const enviarVerificacionCorreo = (email: string, codigo: string): Promise<void> => {
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a"><h1 style="color:#ff5722">Verifica tu correo</h1><p>Escribe este código en Llévalo para confirmar que tienes acceso a esta dirección:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#0f172a">${codigo}</p><p>El código vence en 10 minutos y solo se puede usar una vez. Si no solicitaste esta acción, ignora este mensaje.</p></div>`;
  const texto = `Tu código de verificación de Llévalo es: ${codigo}\n\nVence en 10 minutos y solo se puede usar una vez. Si no solicitaste esta acción, ignora este mensaje.`;
  return enviarCorreo(email, 'Tu código de verificación de Llévalo', texto, html);
};

export const enviarInvitacionRepartidor = (email: string, token: string): Promise<void> =>
  enviarCorreoAccion(
    email,
    'Tu postulación fue aprobada · Llévalo',
    'Postulación aprobada',
    'Tu entrevista presencial fue aprobada. Crea una contraseña para activar tu cuenta de repartidor.',
    'Crear contraseña',
    'activar-repartidor',
    token
  );

export const enviarAvisoRechazoPostulacion = (email: string): Promise<void> =>
  enviarCorreo(
    email,
    'Actualización de tu postulación · Llévalo',
    'Gracias por postularte como repartidor de Llévalo. Por ahora no podemos aprobar tu postulación.'
  );
