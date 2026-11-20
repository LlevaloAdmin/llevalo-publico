export const estadoPagoAlCancelar = (metodoPago: string, estadoPago: string): string => {
  if (metodoPago === 'saldo_corporativo' && estadoPago === 'pagado') return 'reembolsado';
  if (metodoPago === 'pago_movil' && (estadoPago === 'pagado' || estadoPago === 'pendiente')) {
    return 'reembolso_pendiente';
  }
  return estadoPago;
};

export const referenciaPagoValida = (referencia: unknown): referencia is string =>
  typeof referencia === 'string' && /^\d{1,100}$/.test(referencia);
