const test = require('node:test');
const assert = require('node:assert/strict');
const {
  crearCodigoVerificacion,
  crearTokenSeguro,
  hashCodigoVerificacion,
  hashTokenSeguro
} = require('../dist/utils/secureTokens');

test('genera tokens de un solo uso con entropía suficiente y formato hexadecimal', () => {
  const primerToken = crearTokenSeguro();
  const segundoToken = crearTokenSeguro();

  assert.match(primerToken, /^[a-f0-9]{64}$/);
  assert.notEqual(primerToken, segundoToken);
});

test('almacena una huella estable que no revela el token original', () => {
  const token = crearTokenSeguro();
  const hash = hashTokenSeguro(token);

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hashTokenSeguro(token), hash);
  assert.notEqual(hash, token);
});

test('genera códigos de verificación de seis dígitos y los protege con HMAC', () => {
  const codigo = crearCodigoVerificacion();
  const secreto = 'test-secret-with-sufficient-entropy';

  assert.match(codigo, /^\d{6}$/);
  assert.equal(hashCodigoVerificacion(codigo, secreto).length, 64);
  assert.notEqual(hashCodigoVerificacion(codigo, secreto), hashTokenSeguro(codigo));
  assert.notEqual(hashCodigoVerificacion(codigo, secreto), hashCodigoVerificacion(codigo, 'different-secret'));
});
