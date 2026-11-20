"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerTasasCambio = void 0;
const CACHE_MS = 60_000;
let cachedRates = null;
let cachedAt = 0;
const descargarJson = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
            throw new Error(`El proveedor de tasa respondió HTTP ${response.status}.`);
        return await response.json();
    }
    finally {
        clearTimeout(timeout);
    }
};
const validarTasa = (valor, proveedor) => {
    const tasa = Number(valor);
    if (!Number.isFinite(tasa) || tasa <= 0) {
        throw new Error(`El proveedor ${proveedor} devolvió una tasa inválida.`);
    }
    return tasa;
};
const obtenerDolaresPorUsdt = async () => {
    let errorCoinGecko;
    try {
        const coinGecko = await descargarJson('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
        return validarTasa(coinGecko.tether?.usd, 'CoinGecko USDT');
    }
    catch (error) {
        errorCoinGecko = error;
    }
    try {
        const coinPaprika = await descargarJson('https://api.coinpaprika.com/v1/tickers/usdt-tether');
        return validarTasa(coinPaprika.quotes?.USD?.price, 'CoinPaprika USDT');
    }
    catch (errorCoinPaprika) {
        const mensajeError = (error) => error instanceof Error ? error.message : 'Error desconocido.';
        throw new Error(`No se pudo consultar USDT. CoinGecko: ${mensajeError(errorCoinGecko)} CoinPaprika: ${mensajeError(errorCoinPaprika)}`);
    }
};
const obtenerTasasCambio = async () => {
    if (cachedRates && Date.now() - cachedAt < CACHE_MS)
        return cachedRates;
    try {
        const [dolar, euro, dolaresPorUsdt] = await Promise.all([
            descargarJson('https://ve.dolarapi.com/v1/dolares/oficial'),
            descargarJson('https://ve.dolarapi.com/v1/euros/oficial'),
            obtenerDolaresPorUsdt()
        ]);
        const bolivaresPorDolar = validarTasa(dolar.promedio, 'DolarAPI USD oficial');
        const bolivaresPorEuro = validarTasa(euro.promedio, 'DolarAPI EUR oficial');
        cachedRates = {
            bolivaresPorDolar,
            eurosPorDolar: bolivaresPorDolar / bolivaresPorEuro,
            usdtPorDolar: 1 / dolaresPorUsdt,
            actualizadoEn: new Date().toISOString(),
            desactualizada: false
        };
        cachedAt = Date.now();
        return cachedRates;
    }
    catch (error) {
        if (cachedRates) {
            return { ...cachedRates, desactualizada: true };
        }
        throw error;
    }
};
exports.obtenerTasasCambio = obtenerTasasCambio;
