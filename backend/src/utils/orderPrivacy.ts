export const sanitizarPedidoParaUsuario = (pedido: Record<string, unknown>) => {
  const resultado = { ...pedido };
  delete resultado.cliente_cedula;
  delete resultado.repartidor_placa;
  delete resultado.repartidor_vehiculo_foto;
  return resultado;
};
