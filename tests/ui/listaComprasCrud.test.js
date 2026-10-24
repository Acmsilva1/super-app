
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function method(name,next){const pattern=n=>new RegExp('            (?:async )?'+n+'\\(');return html.slice(html.search(pattern(name)),html.search(pattern(next)));}
const editMethod=method('submitListaEditItem','submitListaRenameItem');
const modalMethod=method('openListaAddModal','submitListaAddItem');
afterEach(()=>{vi.unstubAllGlobals();});
it('edicao usa PATCH e atualiza o item somente apos sucesso',async()=>{
 const row={id:1,item:'Leite',quantidade:2,comprado:true,unidade_medida:'caixa'};
 const el={_listaComprasRows:[row]};vi.stubGlobal('showAppConfirmation',vi.fn());vi.stubGlobal('alert',vi.fn());
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({...row,item:'Leite integral',quantidade:4})})));
 const app=new Function('return new class {'+editMethod+'};')();app.rerenderListaCompras=vi.fn();
 expect(await app.submitListaEditItem(1,'Leite integral',4,el)).toBe(true);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({id:1,item:'Leite integral',quantidade:4});
 expect(fetch.mock.calls[0][1].method).toBe('PATCH');expect(row).toMatchObject({item:'Leite integral',quantidade:4,comprado:true,unidade_medida:'caixa'});
 expect(app.rerenderListaCompras).toHaveBeenCalledOnce();
});
it('falha de salvamento preserva o item anterior e informa erro',async()=>{
 const row={id:1,item:'Leite',quantidade:2};vi.stubGlobal('alert',vi.fn());vi.stubGlobal('showAppConfirmation',vi.fn());vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));
 const app=new Function('return new class {'+editMethod+'};')();app.readApiErrorMessage=async()=> 'Sem permissao';app.rerenderListaCompras=vi.fn();
 expect(await app.submitListaEditItem(1,'Outro',5,{_listaComprasRows:[row]})).toBe(false);
 expect(row).toEqual({id:1,item:'Leite',quantidade:2});expect(alert).toHaveBeenCalledWith('Sem permissao');expect(showAppConfirmation).not.toHaveBeenCalled();
});
function modal(){
 const fields={nome:{value:'',focus:vi.fn(),addEventListener:vi.fn()},qtd:{value:'',focus:vi.fn(),addEventListener:vi.fn()},error:{hidden:true},submit:{disabled:false,textContent:'Salvar'},cancel:{}};
 let submit;const form={querySelector:()=>fields.submit,querySelectorAll:()=>[fields.nome,fields.qtd,fields.submit,fields.cancel],addEventListener:(name,fn)=>{submit=fn;}};
 const elements={'form':form,'#lc-add-nome':fields.nome,'#lc-add-qtd':fields.qtd,'[data-lc-add-error]':fields.error,'[data-lc-add-cancel]':fields.cancel};
 const overlay={querySelector:s=>elements[s],querySelectorAll:()=>[],remove:vi.fn()};
 vi.stubGlobal('document',{querySelector:()=>null,createElement:()=>overlay,addEventListener:vi.fn(),removeEventListener:vi.fn(),body:{appendChild:vi.fn()}});
 const app=new Function('return new class {'+modalMethod+'};')();app.submitListaEditItem=vi.fn(async()=>false);app.submitListaAddItem=vi.fn();
 return {app,fields,overlay,submit:()=>submit({preventDefault(){}})};
}
it('formulario preenche nome e quantidade e cancela sem gravar',()=>{
 const m=modal();m.app.openListaAddModal({_listaComprasRows:[{id:4,item:'Arroz',quantidade:3}]},4);
 expect(m.fields.nome.value).toBe('Arroz');expect(m.fields.qtd.value).toBe('3');expect(m.overlay.innerHTML).toContain('Editar item');
 m.fields.cancel.onclick();expect(m.overlay.remove).toHaveBeenCalled();expect(m.app.submitListaEditItem).not.toHaveBeenCalled();
});
it('quantidade invalida mantem formulario e nao envia alteracao',async()=>{
 const m=modal();m.app.openListaAddModal({_listaComprasRows:[{id:4,item:'Arroz',quantidade:3}]},4);m.fields.qtd.value='0';await m.submit();
 expect(m.fields.error.hidden).toBe(false);expect(m.app.submitListaEditItem).not.toHaveBeenCalled();expect(m.overlay.remove).not.toHaveBeenCalled();
});
it('mantem valores editados para nova tentativa depois de falha',async()=>{
 const m=modal();m.app.openListaAddModal({_listaComprasRows:[{id:4,item:'Arroz',quantidade:3}]},4);m.fields.nome.value='Arroz integral';m.fields.qtd.value='6';await m.submit();
 expect(m.app.submitListaEditItem).toHaveBeenCalledWith(4,'Arroz integral',6,expect.any(Object));expect(m.overlay.remove).not.toHaveBeenCalled();expect(m.fields.submit.disabled).toBe(false);expect(m.fields.nome.value).toBe('Arroz integral');
});
it('mantem o foco no formulario ao navegar pelo teclado',()=>{
 const m=modal();m.fields.cancel.focus=vi.fn();m.fields.submit.focus=vi.fn();
 m.app.openListaAddModal({_listaComprasRows:[{id:4,item:'Arroz',quantidade:3}]},4);
 const onKey=document.addEventListener.mock.calls.find(([name])=>name==='keydown')[1];
 const preventDefault=vi.fn();document.activeElement=m.fields.nome;
 onKey({key:'Tab',shiftKey:true,preventDefault});expect(m.fields.cancel.focus).toHaveBeenCalledOnce();
 document.activeElement=m.fields.cancel;onKey({key:'Tab',shiftKey:false,preventDefault});
 expect(m.fields.nome.focus).toHaveBeenCalledTimes(2);expect(preventDefault).toHaveBeenCalledTimes(2);
});
it('devolve foco ao controle de origem quando cancela',()=>{
 const m=modal();const focus=vi.fn();document.activeElement={isConnected:true,focus};
 m.app.openListaAddModal({_listaComprasRows:[{id:4,item:'Arroz',quantidade:3}]},4);
 m.fields.cancel.onclick();expect(focus).toHaveBeenCalledOnce();
});
