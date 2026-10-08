export const MAX_PNG_BYTES = 3 * 1024 * 1024;
export const MAX_PNG_PIXELS = 16 * 1024 * 1024;
export const MAX_PNG_EDGE = 16384;
export function validatePngHeader(buffer) {
  if (buffer.length > MAX_PNG_BYTES) return 'PNG excede o limite de 3 MB.';
  if (buffer.length < 33 || !buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii',12,16) !== 'IHDR') return 'Cabecalho PNG invalido.';
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width > MAX_PNG_EDGE || height > MAX_PNG_EDGE || width * height > MAX_PNG_PIXELS) return 'Dimensoes PNG excedem o limite permitido.';
  // O exportador do app gera RGBA 8-bit. Nao aceitar formatos com maior custo de memoria.
  if (buffer[24] !== 8 || ![2,6].includes(buffer[25]) || buffer[28] !== 0) return 'Use PNG RGB/RGBA 8-bit sem entrelacamento.';
  return null;
}
