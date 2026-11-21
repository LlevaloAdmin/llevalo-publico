"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardarConfiguracionTarifas = exports.obtenerConfiguracionTarifas = void 0;
const db_1 = require("../db");
const pricing_1 = require("./pricing");
let configuracionLista = null;
const asegurarTablaConfiguracion = () => {
    if (!configuracionLista) {
        configuracionLista = db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion_tarifas (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        envios_por_km NUMERIC(10, 2) NOT NULL DEFAULT 0.50,
        viajes_corto_por_km NUMERIC(10, 2) NOT NULL DEFAULT 0.38,
        viajes_largo_por_km NUMERIC(10, 2) NOT NULL DEFAULT 0.28,
        tarifa_minima NUMERIC(10, 2) NOT NULL DEFAULT 1.50,
        moneda_visualizacion VARCHAR(8) NOT NULL DEFAULT 'VES'
          CHECK (moneda_visualizacion IN ('VES', 'EUR', 'USDT')),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE configuracion_tarifas
        ADD COLUMN IF NOT EXISTS moneda_visualizacion VARCHAR(8) NOT NULL DEFAULT 'VES';
      ALTER TABLE configuracion_tarifas
        ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE configuracion_tarifas
        DROP CONSTRAINT IF EXISTS configuracion_tarifas_moneda_visualizacion_check;
      ALTER TABLE configuracion_tarifas
        ADD CONSTRAINT configuracion_tarifas_moneda_visualizacion_check
        CHECK (moneda_visualizacion IN ('VES', 'EUR', 'USDT'));
      INSERT INTO configuracion_tarifas (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `).then(() => undefined).catch((error) => {
            configuracionLista = null;
            console.error('Error preparando la configuración de tarifas:', error);
            throw error;
        });
    }
    return configuracionLista;
};
const convertirFila = (fila) => ({
    enviosPorKm: Number(fila.envios_por_km),
    viajesDesde1KmPorKm: Number(fila.viajes_largo_por_km),
    viajesLargosPorKm: Number(fila.viajes_corto_por_km),
    viajesLargosDesdeKm: pricing_1.VIAJES_LARGOS_DESDE_KM,
    tarifaMinima: Number(fila.tarifa_minima)
});
const obtenerConfiguracionTarifas = async () => {
    await asegurarTablaConfiguracion();
    const result = await db_1.pool.query(`SELECT envios_por_km, viajes_corto_por_km, viajes_largo_por_km,
            tarifa_minima
     FROM configuracion_tarifas WHERE id = 1`);
    if (!result.rows[0])
        return pricing_1.TARIFAS_POR_DEFECTO;
    return convertirFila(result.rows[0]);
};
exports.obtenerConfiguracionTarifas = obtenerConfiguracionTarifas;
const guardarConfiguracionTarifas = async (configuracion) => {
    await asegurarTablaConfiguracion();
    const result = await db_1.pool.query(`UPDATE configuracion_tarifas
     SET envios_por_km = $1, viajes_corto_por_km = $2,
         viajes_largo_por_km = $3, tarifa_minima = $4,
         moneda_visualizacion = 'VES', actualizado_en = CURRENT_TIMESTAMP
     WHERE id = 1
     RETURNING envios_por_km, viajes_corto_por_km, viajes_largo_por_km,
               tarifa_minima`, [
        configuracion.enviosPorKm,
        configuracion.viajesLargosPorKm,
        configuracion.viajesDesde1KmPorKm,
        configuracion.tarifaMinima
    ]);
    return convertirFila(result.rows[0]);
};
exports.guardarConfiguracionTarifas = guardarConfiguracionTarifas;
