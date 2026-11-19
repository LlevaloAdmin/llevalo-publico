"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularTarifa = exports.tarifaPorKilometro = void 0;
const tarifaPorKilometro = (tipoServicio, distanciaKm) => {
    if (tipoServicio !== 'viajes')
        return 0.5;
    return distanciaKm >= 1 ? 0.28 : 0.38;
};
exports.tarifaPorKilometro = tarifaPorKilometro;
const calcularTarifa = (tipoServicio, distanciaKm) => Number(Math.max(1.5, distanciaKm * (0, exports.tarifaPorKilometro)(tipoServicio, distanciaKm)).toFixed(2));
exports.calcularTarifa = calcularTarifa;
