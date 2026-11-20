"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.referenciaPagoValida = exports.estadoPagoAlCancelar = void 0;
const estadoPagoAlCancelar = (metodoPago, estadoPago) => {
    if (metodoPago === 'saldo_corporativo' && estadoPago === 'pagado')
        return 'reembolsado';
    if (metodoPago === 'pago_movil' && (estadoPago === 'pagado' || estadoPago === 'pendiente')) {
        return 'reembolso_pendiente';
    }
    return estadoPago;
};
exports.estadoPagoAlCancelar = estadoPagoAlCancelar;
const referenciaPagoValida = (referencia) => typeof referencia === 'string' && /^\d{1,100}$/.test(referencia);
exports.referenciaPagoValida = referenciaPagoValida;
