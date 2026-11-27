import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles/bank-theme.css', import.meta.url), 'utf8');

function method(name, next) {
  const pattern = (n) => new RegExp(`            (?:async )?${n}\\(`);
  return html.slice(html.search(pattern(name)), html.search(pattern(next)));
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[ch]));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lista de compras — tags e confirmações', () => {
  it('cola a quantidade ao nome e renderiza categoria como tag colorida', () => {
    const rowMethod = method('renderListaComprasItemRow', 'renderListaComprasContent');
    const slugMethod = method('getListaComprasCategoriaSlug', 'getListaComprasQtyTag');
    const qtyMethod = method('getListaComprasQtyTag', 'getListaComprasItemMeta');
    const metaMethod = method('getListaComprasItemMeta', 'renderListaComprasItemRow');
    const compradoMethod = 'isListaComprasComprado(val){return Boolean(val);}';
    const app = new Function('escapeHtml', `return new class {${compradoMethod}${slugMethod}${qtyMethod}${metaMethod}${rowMethod}};`)(escapeHtml);
    const htmlRow = app.renderListaComprasItemRow({
      id: 7,
      item: 'Arroz',
      quantidade: 2,
      categoria: 'Essencial',
      comprado: false,
      posicao: 1
    });
    expect(htmlRow).toContain('class="lc-item__qty"');
    expect(htmlRow).toContain('>x2<');
    expect(htmlRow).toContain('size="6"');
    expect(htmlRow).toContain('lc-item__meta lc-cat lc-cat--essencial');
    expect(htmlRow).toContain('>Essencial<');
    expect(css).toContain('gap: 0.2rem');
    expect(css).toContain('.lc-cat--essencial');
    expect(css).toContain('--lc-cat-feira:');
  });

  it('aplica as mesmas classes de cor nos filtros de categoria', () => {
    expect(html).toContain('lc-filter--${slug}');
    expect(css).toContain('.lc-filter--limpeza');
    expect(css).toContain('.lc-filter--higiene.is-active');
    expect(css).toContain('.lc-filter--feira');
    expect(css).toContain('.lc-filter--essencial.is-active');
    expect(css).toContain('.lc-filter--gelados');
  });

  it('pede confirmação visual antes de agrupar, desmarcar e apagar todos', async () => {
    const agrupar = method('submitListaAgrupar', 'bindListaComprasDrag');
    const reset = method('submitListaResetChecks', 'submitListaDeleteAll');
    const del = method('submitListaDeleteAll', 'getBrazilDateIsoFrom');
    const app = new Function(`return new class {
      getListaComprasCategorias(){return ["Limpeza","Higiene","Feira","Essencial","Gelados"];}
      sortListaComprasRows(rows){return [...rows];}
      agruparListaComprasRows(rows){return [...rows].reverse();}
      ${agrupar}${reset}${del}
    };`)();
    app.showConfirm = vi.fn(async () => false);
    app.submitListaReorder = vi.fn(async () => true);
    app.flushUndoToast = vi.fn(async () => {});
    app.refreshListaComprasContent = vi.fn(async () => {});
    app.showAlert = vi.fn(async () => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    vi.stubGlobal('showAppConfirmation', vi.fn());

    const el = {
      _listaComprasRows: [
        { id: 1, categoria: 'Feira', posicao: 1 },
        { id: 2, categoria: 'Essencial', posicao: 2 }
      ]
    };
    await app.submitListaAgrupar(el);
    expect(app.showConfirm).toHaveBeenCalledWith(
      'Agrupar itens',
      'Reorganizar a lista agrupando os itens por categoria?',
      { confirmLabel: 'Agrupar' }
    );
    expect(app.submitListaReorder).not.toHaveBeenCalled();

    await app.submitListaResetChecks(el);
    expect(app.showConfirm).toHaveBeenCalledWith(
      'Desmarcar tudo',
      'Desmarcar todos os itens da lista?',
      { confirmLabel: 'Desmarcar' }
    );
    expect(fetch).not.toHaveBeenCalled();

    await app.submitListaDeleteAll(el);
    expect(app.showConfirm).toHaveBeenCalledWith(
      'Apagar todos',
      'Apagar TODOS os itens da lista? Não é possível desfazer.',
      { confirmLabel: 'Apagar todos' }
    );
    expect(agrupar).toContain('this.showConfirm');
    expect(reset).toContain('this.showConfirm');
    expect(del).toContain('this.showConfirm');
    expect(agrupar).not.toMatch(/(?:window\.)?confirm\s*\(/);
    expect(reset).not.toMatch(/(?:window\.)?confirm\s*\(/);
    expect(del).not.toMatch(/(?:window\.)?confirm\s*\(/);
  });
});
