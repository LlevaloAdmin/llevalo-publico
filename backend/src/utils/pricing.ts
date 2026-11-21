export interface ConfiguracionTarifas {
  enviosPorKm: number;
  viajesDesde1KmPorKm: number;
  viajesLargosPorKm: number;
  viajesLargosDesdeKm: number;
  tarifaMinima: number;
}

export const VIAJES_LARGOS_DESDE_KM = 25;

export const TARIFAS_POR_DEFECTO: ConfiguracionTarifas = {
  enviosPorKm: 0.5,
  viajesDesde1KmPorKm: 0.28,
  viajesLargosPorKm: 0.38,
  viajesLargosDesdeKm: VIAJES_LARGOS_DESDE_KM,
  tarifaMinima: 1.5
};

export const esConfiguracionTarifasValida = (value: unknown): value is ConfiguracionTarifas => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const tarifas = value as Record<string, unknown>;
  const montos = [
    tarifas.enviosPorKm,
    tarifas.viajesDesde1KmPorKm,
    tarifas.viajesLargosPorKm,
    tarifas.tarifaMinima
  ];
  return montos.every(monto => typeof monto === 'number' && Number.isFinite(monto) && monto > 0 && monto <= 1000);
};

export const tarifaPorKilometro = (
  tipoServicio: string,
  distanciaKm: number,
  tarifas: ConfiguracionTarifas = TARIFAS_POR_DEFECTO
): number => {
  if (tipoServicio !== 'viajes') return tarifas.enviosPorKm;
  return distanciaKm >= tarifas.viajesLargosDesdeKm
    ? tarifas.viajesLargosPorKm
    : tarifas.viajesDesde1KmPorKm;
};

export const calcularTarifa = (
  tipoServicio: string,
  distanciaKm: number,
  tarifas: ConfiguracionTarifas = TARIFAS_POR_DEFECTO
): number => {
  if (tipoServicio === 'viajes' && distanciaKm < 1) {
    return Number(tarifas.tarifaMinima.toFixed(2));
  }
  return Number(Math.max(
    tarifas.tarifaMinima,
    distanciaKm * tarifaPorKilometro(tipoServicio, distanciaKm, tarifas)
  ).toFixed(2));
};
