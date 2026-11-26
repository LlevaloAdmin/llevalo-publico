export const normalizarTelefonoRegistro = (telefono: string): string => {
  const entrada = telefono.replace(/\D/g, '');
  const digitos = entrada.startsWith('00') ? entrada.slice(2) : entrada;
  if (digitos.length === 12 && digitos.startsWith('58')) return digitos;
  if (digitos.length === 11 && digitos.startsWith('0')) return `58${digitos.slice(1)}`;
  if (digitos.length === 10) return `58${digitos}`;
  return digitos;
};

export const normalizarCedulaRegistro = (cedula: string): string =>
  cedula.toUpperCase().replace(/[^VE0-9]/g, '');
