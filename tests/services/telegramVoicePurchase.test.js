import { describe, it, expect } from 'vitest';
import { normalizeVoicePurchase } from '../../lib/telegramVoice.js';
import { parseTelegramPurchase } from '../../lib/telegramPurchase.js';

describe('Compras faladas naturalmente', () => {
  it.each([
    ['Comprei um café por dez reais e vinte centavos.', 'um café', 10.20],
    ['Eu comprei um café por 10,20 reais.', 'um café', 10.20],
    ['Café dez reais e vinte.', 'Café', 10.20],
    ['Café quinze e trinta', 'Café', 15.30],
    ['Café, 15 e 30', 'Café', 15.30],
    ['Comprei café por quinze e trinta', 'café', 15.30],
    ['Gastei quinze e trinta no café', 'café', 15.30],
    ['Café dez e vinte', 'Café', 10.20],
    ['Café quinze e três', 'Café', 15.03],
    ['Café vinte e cinco', 'Café', 25],
    ['Mercado cento e vinte e trinta', 'Mercado', 120.30],
    ['Mercado cento e cinquenta', 'Mercado', 150],
    ['Café por dez reais.', 'Café', 10],
    ['Supermercado no valor de trinta reais e cinquenta centavos', 'Supermercado', 30.50],
    ['Gastei dez reais e vinte centavos no café', 'café', 10.20],
    ['Paguei trinta reais no supermercado', 'supermercado', 30],
    ['Almoço, quinze reais', 'Almoço', 15],
    ['Compra vírgula dez vírgula vinte', 'Compra', 10.20],
    ['Compra vírgula 10 vírgula 20', 'Compra', 10.20],
    ['Café dez vírgula dois', 'Café', 10.20],
    ['Café cinquenta centavos', 'Café', 0.50],
    ['Mercado por mil e duzentos reais', 'Mercado', 1200],
  ])('interpreta %s e conserva o contrato de confirmação', (text, description, value) => {
    const payload = parseTelegramPurchase(normalizeVoicePurchase(text));
    expect(payload).toMatchObject({ descricao: description, valor: value, payment_label: 'Débito', categoria: 'Outros' });
  });
  it.each([
    'Café por dez reais e cento e vinte centavos',
    'Comprei café por dez reais e pão por vinte reais',
    'Café 10 e pão 20',
    'Café quinze e pão vinte',
    'Café quinze e cento e vinte',
    'Café quinze e trinta e quarenta',
    'Comprei café por dez reais no crédito',
    'Comprei café ontem por dez reais',
    'Comprei café por dez reais em duas parcelas',
    'Café por zero reais',
    'Café por menos dez reais',
    'Café por dez reais ou vinte reais',
  ])('recusa valor ou intenção ambígua: %s', text => {
    expect(normalizeVoicePurchase(text)).toBeNull();
  });
  it('mantém o texto no formato existente', () => {
    expect(parseTelegramPurchase('Café, 10,20')?.valor).toBe(10.20);
    expect(parseTelegramPurchase('Comprei café por dez reais')).toBeNull();
  });
});
