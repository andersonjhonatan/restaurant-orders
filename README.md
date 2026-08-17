# Sabor da Casa by Vanuza

<p align="center">
  <img src="assets/logo-sabor-da-casa.svg" alt="Logo Sabor da Casa by Vanuza" width="260" />
</p>

Sistema web de **cardápio, carrinho e pedidos** do **Sabor da Casa**, administrado por **Vanuza**.

> **Da minha cozinha para sua família.**

## Contato

- **Responsável:** Vanuza
- **WhatsApp:** (87) 98839-5085
- **Atendimento:** pedidos finalizados diretamente no WhatsApp

## O que já está funcionando

- site responsivo e mobile-first com a identidade Sabor da Casa;
- cardápio carregado pela API e condicionado à disponibilidade do estoque;
- carrinho persistido no navegador;
- checkout com nome, telefone, entrega/retirada, endereço, pagamento e observação;
- cálculo do valor no servidor para evitar alteração de preços pelo navegador;
- registro de pedidos em `data/orders.json`;
- geração automática da mensagem de confirmação para o WhatsApp da Vanuza;
- painel administrativo em `/admin`;
- atualização do status do pedido: Novo, Confirmado, Em preparo, Saiu para entrega, Concluído ou Cancelado;
- API FastAPI e documentação Swagger;
- controle de estoque e montagem de cardápio que estavam incompletos no projeto original.

## Tecnologias

- Python
- FastAPI
- Uvicorn
- Pydantic
- HTML5
- CSS3 responsivo
- JavaScript sem framework
- Pytest

## Como executar

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.app:app --reload
```

No Windows, ative o ambiente com:

```bash
.venv\Scripts\activate
```

Depois acesse:

- **Site:** `http://127.0.0.1:8000`
- **Painel da Vanuza:** `http://127.0.0.1:8000/admin`
- **Swagger:** `http://127.0.0.1:8000/docs`
- **Health check:** `http://127.0.0.1:8000/health`

## Painel administrativo

O painel usa o header `X-Admin-Token`. Para demonstração local o token padrão é:

```text
vanuza-demo
```

Para produção, **não utilize o token padrão**. Defina uma variável de ambiente própria antes de iniciar:

```bash
export ADMIN_TOKEN="uma-senha-forte-e-exclusiva"
uvicorn src.app:app --host 0.0.0.0 --port 8000
```

## Endpoints principais

| Método | Endpoint | Função |
| --- | --- | --- |
| GET | `/api/info` | dados públicos do Sabor da Casa |
| GET | `/api/menu` | cardápio disponível |
| POST | `/api/orders` | registra um novo pedido |
| GET | `/api/orders` | lista pedidos com token de admin |
| PATCH | `/api/orders/{id}/status` | altera o status de um pedido |
| GET | `/brand/logo` | logo da marca |
| GET | `/health` | status do serviço |

O endpoint legado `POST /order` foi mantido para compatibilidade com a estrutura original do projeto.

## Estrutura

```text
assets/
  logo-sabor-da-casa.svg

data/
  inventory_base_data.csv
  menu_base_data.csv
  orders.json

frontend/
  index.html
  styles.css
  app.js
  admin.html
  admin.css
  admin.js

src/
  app.py
  models/
  services/

tests/
```

## Próximo passo para produção

O armazenamento JSON é adequado para demonstração e operação local de baixo volume. Para colocar o sistema em produção com múltiplos acessos simultâneos, o recomendado é migrar pedidos e estoque para PostgreSQL, adicionar autenticação de usuário no painel e configurar backup.

---

**Sabor da Casa by Vanuza**  
Da minha cozinha para sua família.
