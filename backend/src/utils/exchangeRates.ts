export interface TasasCambio {
  bolivaresPorDolar: number;
  eurosPorDolar: number;
  usdtPorDolar: number;
  actualizadoEn: string;
  desactualizada: boolean;
}

interface DolarApiRate {
  promedio?: unknown;
}

interface CoinGeckoRate {
  tether?: { usd?: unknown };
}

const CACHE_MS = 60_000;
let cachedRates: TasasCambio | null = null;
let cachedAt = 0;

const descargarJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`El proveedor de tasa respondió HTTP ${response.status}.`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
};

const validarTasa = (valor: unknown, proveedor: string): number => {
  const tasa = Number(valor);
  if (!Number.isFinite(tasa) || tasa <= 0) {
    throw new Error(`El proveedor ${proveedor} devolvió una tasa inválida.`);
  }
  return tasa;
};

export const obtenerTasasCambio = async (): Promise<TasasCambio> => {
  if (cachedRates && Date.now() - cachedAt < CACHE_MS) return cachedRates;

  try {
    const [dolar, euro, tether] = await Promise.all([
      descargarJson<DolarApiRate>('https://ve.dolarapi.com/v1/dolares/oficial'),
      descargarJson<DolarApiRate>('https://ve.dolarapi.com/v1/euros/oficial'),
      descargarJson<CoinGeckoRate>('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd')
    ]);
    const bolivaresPorDolar = validarTasa(dolar.promedio, 'DolarAPI USD oficial');
    const bolivaresPorEuro = validarTasa(euro.promedio, 'DolarAPI EUR oficial');
    const dolaresPorUsdt = validarTasa(tether.tether?.usd, 'CoinGecko USDT');
    cachedRates = {
      bolivaresPorDolar,
      eurosPorDolar: bolivaresPorDolar / bolivaresPorEuro,
      usdtPorDolar: 1 / dolaresPorUsdt,
      actualizadoEn: new Date().toISOString(),
      desactualizada: false
    };
    cachedAt = Date.now();
    return cachedRates;
  } catch (error) {
    if (cachedRates) {
      return { ...cachedRates, desactualizada: true };
    }
    throw error;
  }
};
