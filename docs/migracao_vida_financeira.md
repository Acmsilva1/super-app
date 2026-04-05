# Plano de Migração: Módulo "Vida Financeira"

Este documento detalha a arquitetura e os passos práticos para unificar visualmente os módulos de **Finanças** e **Despesas Fixas** em um único painel mestre de "Vida Financeira", mantendo o backend estritamente desacoplado.

---

## 🎯 Objetivo Arquitetural
Criar uma experiência unificada para o usuário (um único "Apartamento") através de abas no Front-end, enquanto os motores de dados (Back-end) continuam independentes, garantindo manutenibilidade e segurança modular.

- **Interface Única (Ponto de Entrada):** Modulo Master "Vida Financeira"
- **Cabeçalho Único (Dashboard Consolidador):** Exibe Totais Globais (Receitas vs Saídas Totais) e o gráfico geral.
- **Divisão Interna:** Duas abas alternáveis sem recarregamento (`Finanças / Variáveis` e `Despesas Fixas`).
- **Data Layer (Back-end):** 
  - Endpoint 1: `/api/financas` (Tabela `lancamentos`)
  - Endpoint 2: `/api/despesas-fixas` (Tabela `despesas_fixas`)

---

## 🛠️ Passo a Passo da Implementação

### 1. Refatoração Visual (`index.html`)
Atualmente, as funções `renderFinancasContent` e `renderDespesasFixasContent` apagam e recriam inteiramente o `.window-content`.

**Mudança necessária:**
Criar uma nova função **Mestre**, ex: `renderVidaFinanceiraContent(el, dataFin, dataFixas)`, que criará o esqueleto da página:

```html
<!-- Esqueleto Proposto do Módulo -->
<div class="vida-financeira-layout">
    <!-- CABEÇALHO GLOBAL -->
    <header class="consolidado-header">
        <div class="totais-globais">
           <!-- Receitas Mês | Despesas Variáveis | Despesas Fixas | Saldo Líquido -->
        </div>
        <div class="grafico-master">
            <!-- Gráfico de Pizza ou Barras centralizado -->
        </div>
    </header>

    <!-- NAVEGAÇÃO POR ABAS -->
    <nav class="abas-navegacao">
        <button id="aba-variaveis" class="active">Lançamentos</button>
        <button id="aba-fixas">Despesas Fixas</button>
    </nav>

    <!-- CONTAINERS INDEPENDENTES -->
    <div id="conteudo-variaveis" class="aba-conteudo active">
        <!-- Injetar a lista e formulário de inserção finanças aqui -->
    </div>
    
    <div id="conteudo-fixas" class="aba-conteudo" style="display: none;">
        <!-- Injetar a lista e formulário de inserção despesas fixas aqui -->
    </div>
</div>
```

### 2. Orquestração de Chamadas na API (`loadAppContent`)
Como o front-end passará a exibir duas ferramentas simultâneas, o `loadAppContent` (quando chamado o `appId = 'vida_financeira'`) deverá carregar as duas bases simultaneamente para que a troca de abas não tenha carregamento:

**Exemplo de código conceitual:**
```javascript
const resFinancas = fetch('/api/financas?bi=1&mes_ano=' + mesAno);
const resFixas = fetch('/api/despesas-fixas?mes_ano=' + mesAno);

const [dadosFinancas, dadosFixas] = await Promise.all([
    resFinancas.then(r => r.json()),
    resFixas.then(r => r.json())
]);

this.renderVidaFinanceiraContent(contentEl, dadosFinancas, dadosFixas);
```

### 3. Tratamento de IDs e Conflitos (Formulários)
Como teremos dois formulários de inserção renderizados na mesma janela na memória HTML:
- Atualizar os identificadores. O que era `id="fin-valor"` pode passar para `id="fin-variavel-valor"` e `id="fin-fixa-valor"`.
- Atualizar os gatilhos das requisições `POST` (ex: botões de Salvar/Inserir) para lerem os novos escopos e chamarem seus respectivos serviços de forma independente (`submitFinancasSave` e `submitDespesasFixasSave`).

### 4. Gestão de Estado Global (Mês/Ano)
Pelo fato do novo cabeçalho mestre governar ambas as abas:
- O seletor de "Mês/Ano" deve ficar isolado no Cabeçalho Global (não dentro do painel das finanças ou das fixas de forma individual).
- Quando o usuário alterar o ano/mês no seleletor master, a função deve disparar atualização massiva nas duas bases de uma só vez para repopular os containers.

---

## ✅ Resumo dos Benefícios
- O banco de dados Supabase sofre `Zero` alterações. As tabelas seguem intactas.
- O código do NodeJS para API segue intocado. Manutenções seguem independentes.
- A experiência do usuário eleva drasticamente: o delay de transitar entre uma regra de gasto ou a inserção de conta de luz some completamente do uso diário, virando um simples clique lateral em um dashboard muito mais rico visualmente.
