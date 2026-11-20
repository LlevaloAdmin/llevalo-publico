"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codigoPedido = void 0;
const codigoPedido = (id) => `LLV-${String(id).padStart(6, '0')}`;
exports.codigoPedido = codigoPedido;
