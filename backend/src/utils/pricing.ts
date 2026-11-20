export interface ConfiguracionTarifas {
  enviosPorKm: number;
  viajesCortoPorKm: number;
  viajesLargoPorKm: number;
  tarifaMinima: number;
  monedaVisualizacion: 'VES' | 'EUR' | 'USDT';
}

export const TARIFAS_POR_DEFECTO: ConfiguracionTarifas = {
  enviosPorKm: 0.5,
  viajesCortoPorKm: 0.38,
  viajesLargoPorKm: 0.28,
  tarifaMinima: 1.5,
  monedaVisualizacion: 'VES'
};

export const esConfiguracionTarifasValida = (value: unknown): value is ConfiguracionTarifas => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const tarifas = value as Record<string, unknown>;
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

export const tarifaPorKilometro = (
  tipoServicio: string,
  distanciaKm: number,
  tarifas: ConfiguracionTarifas = TARIFAS_POR_DEFECTO
): number => {
  if (tipoServicio !== 'viajes') return tarifas.enviosPorKm;
  return distanciaKm >= 1 ? tarifas.viajesLargoPorKm : tarifas.viajesCortoPorKm;
};

export const calcularTarifa = (
  tipoServicio: string,
  distanciaKm: number,
  tarifas: ConfiguracionTarifas = TARIFAS_POR_DEFECTO
): number =>
  Number(Math.max(tarifas.tarifaMinima, distanciaKm * tarifaPorKilometro(tipoServicio, distanciaKm, tarifas)).toFixed(2));
