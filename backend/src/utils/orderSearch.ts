export const fechaIsoValida = (fecha: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const valor = new Date(Date.UTC(anio, mes - 1, dia));
  return valor.getUTCFullYear() === anio
    && valor.getUTCMonth() === mes - 1
    && valor.getUTCDate() === dia;
};

export const horaPedidoValida = (hora: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);

export const desfaseHorarioValido = (desfase: number): boolean =>
  Number.isSafeInteger(desfase) && desfase >= -840 && desfase <= 840;
