const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { enviarVerificacionCorreo } = require('../dist/utils/email');

const guardarVariable = (nombre) => ({
  existe: Object.prototype.hasOwnProperty.call(process.env, nombre),
  valor: process.env[nombre]
});

const restaurarVariable = (nombre, anterior) => {
  if (anterior.existe) process.env[nombre] = anterior.valor;
  else delete process.env[nombre];
};

test('envía el código al relay de Apps Script y detecta errores del relay', async () => {
  const variables = ['GMAIL_RELAY_URL', 'GMAIL_RELAY_SECRET'].map((nombre) => [
    nombre,
    guardarVariable(nombre)
  ]);
  const postOriginal = axios.post;
  const llamadas = [];
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/test-deployment/exec';
  process.env.GMAIL_RELAY_SECRET = 'test-relay-secret';
  axios.post = async (url, payload, config) => {
    llamadas.push({ url, payload, config });
    return { data: { ok: llamadas.length === 1, error: 'Límite diario alcanzado.' } };
  };

  try {
    await enviarVerificacionCorreo('cliente@example.com', '123456');
    assert.equal(llamadas[0].url, process.env.GMAIL_RELAY_URL);
    assert.equal(llamadas[0].payload.secret, process.env.GMAIL_RELAY_SECRET);
    assert.equal(llamadas[0].payload.to, 'cliente@example.com');
    assert.match(llamadas[0].payload.text, /123456/);
    assert.equal(llamadas[0].config.timeout, 20_000);

    await assert.rejects(
      enviarVerificacionCorreo('cliente@example.com', '654321'),
      /Límite diario alcanzado/
    );
  } finally {
    axios.post = postOriginal;
    for (const [nombre, anterior] of variables) restaurarVariable(nombre, anterior);
  }
});
