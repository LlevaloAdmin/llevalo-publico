import { pool } from '../db';
import { TARIFAS_POR_DEFECTO } from './pricing';
import type { ConfiguracionTarifas } from './pricing';

interface ConfiguracionTarifasFila {
  envios_por_km: string | number;
  viajes_corto_por_km: string | number;
  viajes_largo_por_km: string | number;
  tarifa_minima: string | number;
  moneda_visualizacion: string;
}

let configuracionLista: Promise<void> | null = null;

const asegurarTablaConfiguracion = () => {
  if (!configuracionLista) {
    configuracionLista = pool.query(`
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

const convertirFila = (fila: ConfiguracionTarifasFila): ConfiguracionTarifas => ({
  enviosPorKm: Number(fila.envios_por_km),
  viajesCortoPorKm: Number(fila.viajes_corto_por_km),
  viajesLargoPorKm: Number(fila.viajes_largo_por_km),
  tarifaMinima: Number(fila.tarifa_minima),
  monedaVisualizacion: fila.moneda_visualizacion as ConfiguracionTarifas['monedaVisualizacion']
});

export const obtenerConfiguracionTarifas = async (): Promise<ConfiguracionTarifas> => {
  await asegurarTablaConfiguracion();
  const result = await pool.query(
    `SELECT envios_por_km, viajes_corto_por_km, viajes_largo_por_km,
            tarifa_minima, moneda_visualizacion
     FROM configuracion_tarifas WHERE id = 1`
  );
  if (!result.rows[0]) return TARIFAS_POR_DEFECTO;
  return convertirFila(result.rows[0] as ConfiguracionTarifasFila);
};

export const guardarConfiguracionTarifas = async (
  configuracion: ConfiguracionTarifas
): Promise<ConfiguracionTarifas> => {
  await asegurarTablaConfiguracion();
  const result = await pool.query(
    `UPDATE configuracion_tarifas
     SET envios_por_km = $1, viajes_corto_por_km = $2,
         viajes_largo_por_km = $3, tarifa_minima = $4,
         moneda_visualizacion = $5, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = 1
     RETURNING envios_por_km, viajes_corto_por_km, viajes_largo_por_km,
               tarifa_minima, moneda_visualizacion`,
    [
      configuracion.enviosPorKm,
      configuracion.viajesCortoPorKm,
      configuracion.viajesLargoPorKm,
      configuracion.tarifaMinima,
      configuracion.monedaVisualizacion
    ]
  );
  return convertirFila(result.rows[0] as ConfiguracionTarifasFila);
};
