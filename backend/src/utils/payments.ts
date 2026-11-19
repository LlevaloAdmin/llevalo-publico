export const estadoPagoAlCancelar = (metodoPago: string, estadoPago: string): string => {
  if (metodoPago === 'saldo_corporativo' && estadoPago === 'pagado') return 'reembolsado';
  if (metodoPago === 'pago_movil' && (estadoPago === 'pagado' || estadoPago === 'pendiente')) {
    return 'reembolso_pendiente';
  }
  return estadoPago;
};
