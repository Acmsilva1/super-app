-- Seed manual: André e Juliana, sete dias e cinco refeições por dia.
-- Sem óleo. Reaplicar também remove apenas o óleo das dietas deste seed, preservando outras edições.
-- Fonte: cardapio_7_dias_1600_kcal (1).pdf. Não altera o schema ou dietas existentes.
-- Executar no SQL Editor como responsável pelo banco, após as migrations de dietas,
-- meta_calorias, dietas semanais (20261010) e alerta_ativo (20261010).
-- Se houver homônimos, consulte id,nome,sexo,created_by de tb_saude_perfis
-- e preencha AMBOS os IDs abaixo. Não use IDs deduzidos da imagem.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temporary table seed_cardapio_20261011_targets(perfil_id bigint primary key) on commit drop;
do $seed$
declare
  v_andre_id bigint := null;   -- Opcional: ID real do perfil André.
  v_juliana_id bigint := null; -- Opcional: ID real do perfil Juliana.
  v_owner uuid := null;       -- Opcional: created_by real da conta, para filtrar a busca.
  v_pairs integer;
  v_count integer;
  v_revision constant text := 'Versão sem óleo: o óleo foi excluído dos itens a pedido do usuário. As estimativas e orientações originais abaixo incluem óleo e são apenas referência histórica; não representam as calorias deste cardápio adaptado. O app calcula os nutrientes dos itens vinculados ao catálogo.';
  v_week jsonb := $cardapio$[
  {
    "titulo": "Segunda-feira",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Tomate",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Abóbora",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Brócolis",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Pepino",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Abobrinha",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Chuchu",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ]
  },
  {
    "titulo": "Terça-feira",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Tomate",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Pepino",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Couve",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Couve-flor",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ]
  },
  {
    "titulo": "Quarta-feira",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Tomate",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Pepino",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Abóbora",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Brócolis",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Chuchu",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Couve",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ]
  },
  {
    "titulo": "Quinta-feira",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Tomate",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Abobrinha",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Pepino",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Brócolis",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Chuchu",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ]
  },
  {
    "titulo": "Sexta-feira",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Tomate",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Pepino",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Abóbora",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Couve",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Couve-flor",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ]
  },
  {
    "titulo": "Sábado",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Tomate",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Brócolis",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Pepino",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Abobrinha",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Chuchu",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ]
  },
  {
    "titulo": "Domingo",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Tomate",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Pepino",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Abóbora",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Couve-flor",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "quantidade_valor": 2,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "100 g",
            "quantidade_valor": 100,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "quantidade_valor": 3,
            "quantidade_unidade": "un",
            "observacao": "Ovos grandes.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Brócolis",
            "quantidade": "200 g",
            "quantidade_valor": 200,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Cenoura",
            "quantidade": "150 g",
            "quantidade_valor": 150,
            "quantidade_unidade": "g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ]
  }
]$cardapio$::jsonb;
  v_days jsonb;
  v_source constant text := 'seed-cardapio-7-dias-1600-kcal-20261011';
begin
  if to_regprocedure('public.saude_diet_week_valid(boolean,jsonb,integer)') is null then
    raise exception 'Aplique primeiro a migration 20261010_add_saude_dietas_semanais.sql.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_source,0));
  if (v_andre_id is null) <> (v_juliana_id is null) then
    raise exception 'Preencha os dois IDs de perfil ou deixe ambos nulos.';
  end if;
  if v_andre_id is null then
    select count(*) into v_pairs
      from public.tb_saude_perfis a join public.tb_saude_perfis j on j.created_by=a.created_by
      where lower(trim(a.nome)) in ('andré','andre') and a.sexo='masculino'
        and lower(trim(j.nome))='juliana' and j.sexo='feminino'
        and (v_owner is null or a.created_by=v_owner);
    if v_pairs <> 1 then
      raise exception 'Esperado um único par André/Juliana da mesma conta; encontrados %. Informe os IDs reais e/ou created_by no início do seed.',v_pairs;
    end if;
    select a.id,j.id into v_andre_id,v_juliana_id
      from public.tb_saude_perfis a join public.tb_saude_perfis j on j.created_by=a.created_by
      where lower(trim(a.nome)) in ('andré','andre') and a.sexo='masculino'
        and lower(trim(j.nome))='juliana' and j.sexo='feminino'
        and (v_owner is null or a.created_by=v_owner);
  end if;
  perform id from public.tb_saude_perfis where id in (v_andre_id,v_juliana_id) for share;
  select count(*),max(a.created_by::text)::uuid into v_count,v_owner
    from public.tb_saude_perfis a join public.tb_saude_perfis j on j.created_by=a.created_by
    where a.id=v_andre_id and j.id=v_juliana_id and a.id<>j.id
      and lower(trim(a.nome)) in ('andré','andre') and a.sexo='masculino'
      and lower(trim(j.nome))='juliana' and j.sexo='feminino'
      and a.created_by is not null and (v_owner is null or a.created_by=v_owner);
  if v_count <> 1 then
    raise exception 'IDs incompatíveis: confirme nomes, sexos e o mesmo proprietário para André e Juliana.';
  end if;
  insert into seed_cardapio_20261011_targets values(v_andre_id),(v_juliana_id);
  if exists(select 1 from public.tb_saude_dietas d join seed_cardapio_20261011_targets t
    on d.slug='seed-cardapio-1600-20261011-perfil-' || t.perfil_id::text
    where d.perfil_id is distinct from t.perfil_id or d.created_by is distinct from v_owner
      or d.source_file is distinct from v_source) then
    raise exception 'Um slug reservado pelo seed pertence a outra dieta. Nenhuma dieta foi substituída.';
  end if;
  -- Atualiza somente dietas deste seed e destes perfis. Preserva os demais itens,
  -- quantidades, refeições, dias, título e edições realizadas no app.
  perform d.id from public.tb_saude_dietas d join seed_cardapio_20261011_targets t on t.perfil_id=d.perfil_id
    where d.source_file=v_source and d.slug='seed-cardapio-1600-20261011-perfil-' || t.perfil_id::text for update of d;
  with cleaned as (
    select d.id,jsonb_agg((day.value - 'calorias_pdf') || jsonb_build_object('refeicoes',(
      select jsonb_agg((meal.value - 'calorias_pdf') || jsonb_build_object('itens',coalesce((
        select jsonb_agg(item.value order by item.ordinality)
          from jsonb_array_elements(meal.value->'itens') with ordinality item
          where coalesce(lower(trim(item.value->>'nome')),'') not in ('óleo','oleo')
      ),'[]'::jsonb)) order by meal.ordinality)
      from jsonb_array_elements(day.value->'refeicoes') with ordinality meal
    )) order by day.ordinality) as semana
    from public.tb_saude_dietas d join seed_cardapio_20261011_targets t on t.perfil_id=d.perfil_id
    cross join lateral jsonb_array_elements(d.semana) with ordinality day
    where d.source_file=v_source and d.semanal
      and d.slug='seed-cardapio-1600-20261011-perfil-' || t.perfil_id::text
    group by d.id
  ) update public.tb_saude_dietas d set semana=c.semana,
      observacoes=case when strpos(d.observacoes,v_revision)=0 then v_revision || E'\n\n' || d.observacoes else d.observacoes end
    from cleaned c where d.id=c.id and d.semana is distinct from c.semana;
  select jsonb_agg(jsonb_build_object('numero',ordinality,'titulo',value->>'titulo',
    'jejum_horas',0,'quantidade_refeicoes',5,'carboidrato','','conteudo','') order by ordinality)
    into v_days from jsonb_array_elements(v_week) with ordinality;
  insert into public.tb_saude_dietas (
    slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,
    dias,refeicoes,semanal,semana,observacoes,meta_calorias,perfil_id,source_file,created_by,alerta_ativo
  ) select 'seed-cardapio-1600-20261011-perfil-' || t.perfil_id::text,
    'Cardápio semanal - ovos, legumes e batata inglesa','Plano alimentar',7,
    'Cardápio adaptado, sem óleo: 7 dias, 5 refeições por dia; meta indicada de 1.600 kcal/dia.',
    v_revision || E'\n\n' || 'As calorias são estimativas baseadas em ovos grandes (aprox. 78 kcal cada), batata cozida (aprox. 86 kcal/100 g) e óleo (9 kcal/g). Pesos dos legumes e batata após cozimento. O óleo informado já está contabilizado; não acrescentar óleo sem medir. Valores variam por preparo e alimento. Atenção: Este modelo é muito restritivo e contém 13 ovos por dia. Não é um plano nutricionalmente completo ou uma prescrição individual. Não é indicado adotá-lo sem avaliação de nutricionista, sobretudo em caso de colesterol elevado, diabetes ou problemas renais. Os totais calculados podem ficar abaixo de 1.600 kcal, apesar da meta indicada.','',v_days,'[]'::jsonb,true,v_week,v_revision || E'\n\n' || 'As calorias são estimativas baseadas em ovos grandes (aprox. 78 kcal cada), batata cozida (aprox. 86 kcal/100 g) e óleo (9 kcal/g). Pesos dos legumes e batata após cozimento. O óleo informado já está contabilizado; não acrescentar óleo sem medir. Valores variam por preparo e alimento. Atenção: Este modelo é muito restritivo e contém 13 ovos por dia. Não é um plano nutricionalmente completo ou uma prescrição individual. Não é indicado adotá-lo sem avaliação de nutricionista, sobretudo em caso de colesterol elevado, diabetes ou problemas renais. Os totais calculados podem ficar abaixo de 1.600 kcal, apesar da meta indicada.

Estimativas iniciais (não são valores por alimento):
Segunda-feira: Café da manhã: 381 kcal; Lanche da manhã: 191 kcal; Almoço: 363 kcal; Lanche da tarde: 171 kcal; Jantar: 300 kcal. Total estimado: 1406 kcal.
Terça-feira: Café da manhã: 381 kcal; Lanche da manhã: 171 kcal; Almoço: 454 kcal; Lanche da tarde: 191 kcal; Jantar: 336 kcal. Total estimado: 1533 kcal.
Quarta-feira: Café da manhã: 381 kcal; Lanche da manhã: 171 kcal; Almoço: 363 kcal; Lanche da tarde: 191 kcal; Jantar: 330 kcal. Total estimado: 1436 kcal.
Quinta-feira: Café da manhã: 381 kcal; Lanche da manhã: 191 kcal; Almoço: 436 kcal; Lanche da tarde: 171 kcal; Jantar: 270 kcal. Total estimado: 1449 kcal.
Sexta-feira: Café da manhã: 381 kcal; Lanche da manhã: 171 kcal; Almoço: 411 kcal; Lanche da tarde: 191 kcal; Jantar: 336 kcal. Total estimado: 1490 kcal.
Sábado: Café da manhã: 381 kcal; Lanche da manhã: 191 kcal; Almoço: 406 kcal; Lanche da tarde: 171 kcal; Jantar: 310 kcal. Total estimado: 1459 kcal.
Domingo: Café da manhã: 381 kcal; Lanche da manhã: 171 kcal; Almoço: 400 kcal; Lanche da tarde: 191 kcal; Jantar: 286 kcal. Total estimado: 1429 kcal.',1600,
    t.perfil_id,v_source,v_owner,true
    from seed_cardapio_20261011_targets t
    on conflict (slug) do nothing;
end;
$seed$;
-- Resultado da execução: duas dietas (novas ou anteriormente criadas pelo mesmo seed).
select d.id as dieta_id,p.id as perfil_id,p.nome,d.semanal,d.meta_calorias,
  jsonb_array_length(d.semana) as dias,d.alerta_ativo
from public.tb_saude_dietas d join seed_cardapio_20261011_targets t on t.perfil_id=d.perfil_id
join public.tb_saude_perfis p on p.id=t.perfil_id
where d.slug='seed-cardapio-1600-20261011-perfil-' || t.perfil_id::text order by p.nome;
commit;
