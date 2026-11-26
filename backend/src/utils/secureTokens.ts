import { createHash, createHmac, randomBytes, randomInt } from 'crypto';

export const crearTokenSeguro = (): string => randomBytes(32).toString('hex');

export const hashTokenSeguro = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const crearCodigoVerificacion = (): string =>
  randomInt(100_000, 1_000_000).toString();

export const hashCodigoVerificacion = (codigo: string, secreto: string): string =>
  createHmac('sha256', secreto).update(codigo, 'utf8').digest('hex');
