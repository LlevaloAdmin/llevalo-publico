"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularTarifa = exports.tarifaPorKilometro = exports.esConfiguracionTarifasValida = exports.TARIFAS_POR_DEFECTO = exports.VIAJES_LARGOS_DESDE_KM = void 0;
exports.VIAJES_LARGOS_DESDE_KM = 25;
exports.TARIFAS_POR_DEFECTO = {
    enviosPorKm: 0.5,
    viajesDesde1KmPorKm: 0.28,
    viajesLargosPorKm: 0.38,
    viajesLargosDesdeKm: exports.VIAJES_LARGOS_DESDE_KM,
    tarifaMinima: 1.5
};
const esConfiguracionTarifasValida = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const tarifas = value;
    const montos = [
        tarifas.enviosPorKm,
        tarifas.viajesDesde1KmPorKm,
        tarifas.viajesLargosPorKm,
        tarifas.tarifaMinima
    ];
    return montos.every(monto => typeof monto === 'number' && Number.isFinite(monto) && monto > 0 && monto <= 1000);
};
exports.esConfiguracionTarifasValida = esConfiguracionTarifasValida;
const tarifaPorKilometro = (tipoServicio, distanciaKm, tarifas = exports.TARIFAS_POR_DEFECTO) => {
    if (tipoServicio !== 'viajes')
        return tarifas.enviosPorKm;
    return distanciaKm >= tarifas.viajesLargosDesdeKm
        ? tarifas.viajesLargosPorKm
        : tarifas.viajesDesde1KmPorKm;
};
exports.tarifaPorKilometro = tarifaPorKilometro;
const calcularTarifa = (tipoServicio, distanciaKm, tarifas = exports.TARIFAS_POR_DEFECTO) => {
    if (tipoServicio === 'viajes' && distanciaKm < 1) {
        return Number(tarifas.tarifaMinima.toFixed(2));
    }
    return Number(Math.max(tarifas.tarifaMinima, distanciaKm * (0, exports.tarifaPorKilometro)(tipoServicio, distanciaKm, tarifas)).toFixed(2));
};
exports.calcularTarifa = calcularTarifa;
