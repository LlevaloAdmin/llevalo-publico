"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.solicitudExpirada = exports.referenciaPagoValida = exports.estadoPagoAlCancelar = void 0;
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
const solicitudExpirada = (publicadoEn, ahora = Date.now()) => {
    const timestamp = publicadoEn instanceof Date
        ? publicadoEn.getTime()
        : typeof publicadoEn === 'string' ? Date.parse(publicadoEn) : Number.NaN;
    return Number.isFinite(timestamp) && ahora - timestamp >= 60_000;
};
exports.solicitudExpirada = solicitudExpirada;
