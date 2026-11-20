export const codigoPedido = (id: number): string => `LLV-${String(id).padStart(6, '0')}`;
