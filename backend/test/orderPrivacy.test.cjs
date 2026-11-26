const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizarPedidoParaUsuario } = require('../dist/utils/orderPrivacy');

test('oculta datos de identidad y vehículo sin ocultar el modelo público', () => {
  const pedido = sanitizarPedidoParaUsuario({
    cliente_cedula: 'V-12345678',
    repartidor_placa: 'AB123CD',
    repartidor_vehiculo_foto: 'private-photo-data',
    repartidor_vehiculo: 'Moto Suzuki GN 125',
    descripcion: 'Entrega de paquete'
  });

  assert.equal(pedido.cliente_cedula, undefined);
  assert.equal(pedido.repartidor_placa, undefined);
  assert.equal(pedido.repartidor_vehiculo_foto, undefined);
  assert.equal(pedido.repartidor_vehiculo, 'Moto Suzuki GN 125');
  assert.equal(pedido.descripcion, 'Entrega de paquete');
});
