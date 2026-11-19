"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estadoPagoAlCancelar = void 0;
const estadoPagoAlCancelar = (metodoPago, estadoPago) => {
    if (metodoPago === 'saldo_corporativo' && estadoPago === 'pagado')
        return 'reembolsado';
    if (metodoPago === 'pago_movil' && (estadoPago === 'pagado' || estadoPago === 'pendiente')) {
        return 'reembolso_pendiente';
    }
    return estadoPago;
};
exports.estadoPagoAlCancelar = estadoPagoAlCancelar;
