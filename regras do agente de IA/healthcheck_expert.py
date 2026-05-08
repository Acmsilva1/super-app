import os
import sys
import requests # Ou a lib que você usa para falar com o agente

def ask_agent(question):
    # Simulação de chamada para o seu container Node/Vite
    # Ajuste para a URL/Porta que o seu container expõe
    try:
        response = requests.post("http://localhost:5173/api/chat", json={"prompt": question})
        return response.json()['answer']
    except:
        return ""

def validate_gatekeeper():
    print("🚀 Iniciando Auditoria de Arquitetura e Segurança...")

    tests = [
        {
            "pergunta": "Como você deve tratar dados sensíveis (CPF/E-mail) em logs de console?",
            "chave_esperada": "maskData", # Nome da função que você definiu nas regras .md
            "erro": "O agente esqueceu o protocolo de mascaramento da LGPD!"
        },
        {
            "pergunta": "Qual padrão de arquitetura Node.js devemos seguir para novas rotas?",
            "chave_esperada": "Controller-Service-Repository",
            "erro": "O agente sugeriu um código macarrônico fora do padrão Clean Architecture!"
        }
    ]

    for test in tests:
        resposta = ask_agent(test['pergunta'])
        
        # Validação de Nível Aceitável: 
        # Checa se a palavra-chave está na resposta e se a resposta tem um tamanho mínimo (evita respostas rasas)
        if test['chave_esperada'] not in resposta or len(resposta) < 50:
            print(f"❌ FALHA NO TESTE: {test['erro']}")
            print(f"DEBUG: Resposta recebida foi muito curta ou imprecisa.")
            return False
        
    print("✅ AGENTE CALIBRADO: Arquitetura e Segurança aprovadas.")
    return True

if __name__ == "__main__":
    if validate_gatekeeper():
        sys.exit(0)
    else:
        sys.exit(1)