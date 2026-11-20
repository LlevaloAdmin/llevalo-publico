"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.desfaseHorarioValido = exports.horaPedidoValida = exports.fechaIsoValida = void 0;
const fechaIsoValida = (fecha) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
        return false;
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const valor = new Date(Date.UTC(anio, mes - 1, dia));
    return valor.getUTCFullYear() === anio
        && valor.getUTCMonth() === mes - 1
        && valor.getUTCDate() === dia;
};
exports.fechaIsoValida = fechaIsoValida;
const horaPedidoValida = (hora) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
exports.horaPedidoValida = horaPedidoValida;
const desfaseHorarioValido = (desfase) => Number.isSafeInteger(desfase) && desfase >= -840 && desfase <= 840;
exports.desfaseHorarioValido = desfaseHorarioValido;
