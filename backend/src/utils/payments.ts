export const estadoPagoAlCancelar = (metodoPago: string, estadoPago: string): string => {
  if (metodoPago === 'saldo_corporativo' && estadoPago === 'pagado') return 'reembolsado';
  if (metodoPago === 'pago_movil' && (estadoPago === 'pagado' || estadoPago === 'pendiente')) {
    return 'reembolso_pendiente';
  }
  return estadoPago;
};

export const referenciaPagoValida = (referencia: unknown): referencia is string =>
  typeof referencia === 'string' && /^\d{1,100}$/.test(referencia);

export const solicitudExpirada = (
  publicadoEn: Date | string | null,
  ahora = Date.now()
): boolean => {
  const timestamp = publicadoEn instanceof Date
    ? publicadoEn.getTime()
    : typeof publicadoEn === 'string' ? Date.parse(publicadoEn) : Number.NaN;
  return Number.isFinite(timestamp) && ahora - timestamp >= 60_000;
};
