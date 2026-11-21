const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { verifyAccessToken } = require('../dist/utils/authToken.js');
const secret = process.env.JWT_SECRET;
const sessionId = 'c0a80123-4567-489a-bcde-123456789abc';
const claims = { id: 42, rol: 'cliente', rol_base: 'cliente', es_admin: false, jti: sessionId };

test('accepts a signed access token using the expected algorithm and audience', () => {
  const token = jwt.sign(claims, secret, {
    algorithm: 'HS256',
    audience: 'llevalo-app',
    expiresIn: '10m',
    issuer: 'llevalo-api'
  });

  assert.deepEqual(verifyAccessToken(token), {
    id: 42,
    rol: 'cliente',
    rol_base: 'cliente',
    es_admin: false,
    session_id: sessionId
  });
});

test('rejects invalid signatures, algorithms, audiences, and session identifiers', () => {
  const invalidTokens = [
    jwt.sign(claims, 'another-secret-with-more-than-thirty-two-characters', { algorithm: 'HS256', expiresIn: '10m' }),
    jwt.sign(claims, secret, { algorithm: 'HS512', expiresIn: '10m' }),
    jwt.sign(claims, secret, { algorithm: 'HS256', audience: 'another-app', expiresIn: '10m' }),
    jwt.sign({ ...claims, jti: 'legacy:42' }, secret, { algorithm: 'HS256', expiresIn: '10m' })
  ];

  for (const token of invalidTokens) assert.equal(verifyAccessToken(token), null);
});

test('rejects expired access tokens', () => {
  const token = jwt.sign(claims, secret, {
    algorithm: 'HS256',
    expiresIn: '-1s',
    issuer: 'llevalo-api',
    audience: 'llevalo-app'
  });

  assert.equal(verifyAccessToken(token), null);
});
