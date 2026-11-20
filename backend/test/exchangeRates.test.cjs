const assert = require('node:assert/strict');
const test = require('node:test');

test('falls back to CoinPaprika when CoinGecko is unavailable', async () => {
  const fetchOriginal = global.fetch;
  const urlsConsultadas = [];
  global.fetch = async (url) => {
    const direccion = String(url);
    urlsConsultadas.push(direccion);
    if (direccion.includes('coingecko.com')) {
      return { ok: false, status: 429, json: async () => ({}) };
    }
    if (direccion.includes('coinpaprika.com')) {
      return { ok: true, status: 200, json: async () => ({ quotes: { USD: { price: 0.999 } } }) };
    }
    if (direccion.includes('/v1/dolares/oficial')) {
      return { ok: true, status: 200, json: async () => ({ promedio: 900 }) };
    }
    if (direccion.includes('/v1/euros/oficial')) {
      return { ok: true, status: 200, json: async () => ({ promedio: 990 }) };
    }
    throw new Error(`Unexpected exchange-rate URL: ${direccion}`);
  };

  try {
    const { obtenerTasasCambio } = require('../dist/utils/exchangeRates.js');
    const tasas = await obtenerTasasCambio();
    assert.equal(tasas.bolivaresPorDolar, 900);
    assert.equal(tasas.eurosPorDolar, 900 / 990);
    assert.equal(tasas.usdtPorDolar, 1 / 0.999);
    assert.equal(tasas.desactualizada, false);
    assert.ok(urlsConsultadas.some(url => url.includes('coingecko.com')));
    assert.ok(urlsConsultadas.some(url => url.includes('coinpaprika.com')));
  } finally {
    global.fetch = fetchOriginal;
  }
});
