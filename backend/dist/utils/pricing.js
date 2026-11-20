"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularTarifa = exports.tarifaPorKilometro = exports.esConfiguracionTarifasValida = exports.TARIFAS_POR_DEFECTO = void 0;
exports.TARIFAS_POR_DEFECTO = {
    enviosPorKm: 0.5,
    viajesCortoPorKm: 0.38,
    viajesLargoPorKm: 0.28,
    tarifaMinima: 1.5,
    monedaVisualizacion: 'VES'
};
const esConfiguracionTarifasValida = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const tarifas = value;
    const montos = [
        tarifas.enviosPorKm,
        tarifas.viajesCortoPorKm,
        tarifas.viajesLargoPorKm,
        tarifas.tarifaMinima
    ];
    return montos.every(monto => typeof monto === 'number' && Number.isFinite(monto) && monto > 0 && monto <= 1000)
        && (tarifas.monedaVisualizacion === 'VES'
            || tarifas.monedaVisualizacion === 'EUR'
            || tarifas.monedaVisualizacion === 'USDT');
};
exports.esConfiguracionTarifasValida = esConfiguracionTarifasValida;
const tarifaPorKilometro = (tipoServicio, distanciaKm, tarifas = exports.TARIFAS_POR_DEFECTO) => {
    if (tipoServicio !== 'viajes')
        return tarifas.enviosPorKm;
    return distanciaKm >= 1 ? tarifas.viajesLargoPorKm : tarifas.viajesCortoPorKm;
};
exports.tarifaPorKilometro = tarifaPorKilometro;
const calcularTarifa = (tipoServicio, distanciaKm, tarifas = exports.TARIFAS_POR_DEFECTO) => Number(Math.max(tarifas.tarifaMinima, distanciaKm * (0, exports.tarifaPorKilometro)(tipoServicio, distanciaKm, tarifas)).toFixed(2));
exports.calcularTarifa = calcularTarifa;
