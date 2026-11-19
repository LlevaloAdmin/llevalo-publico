export const tarifaPorKilometro = (tipoServicio: string, distanciaKm: number): number => {
  if (tipoServicio !== 'viajes') return 0.5;
  return distanciaKm >= 1 ? 0.28 : 0.38;
};

export const calcularTarifa = (tipoServicio: string, distanciaKm: number): number =>
  Number(Math.max(1.5, distanciaKm * tarifaPorKilometro(tipoServicio, distanciaKm)).toFixed(2));
