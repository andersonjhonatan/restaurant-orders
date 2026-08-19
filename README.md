# Sabor da Casa by Vanuza

<p align="center">
  <img src="assets/logo-sabor-da-casa.svg" alt="Logo Sabor da Casa by Vanuza" width="260" />
</p>

Sistema web de **cardápio, carrinho, encomendas e gestão de pedidos** do **Sabor da Casa by Vanuza**.

> **Da minha cozinha para sua família.**

## Contato

- **Responsável:** Vanuza
- **WhatsApp:** (87) 98839-5085
- **Atendimento:** retirada no local
- **Endereço de retirada:** Rua Joaquim Deodato, 276

## O que está funcionando

- interface responsiva e mobile-first;
- cardápio do dia e produtos sob encomenda;
- detalhes de produto, opções de tamanho e carrinho persistente no navegador;
- exclusão individual de itens e limpeza completa do carrinho com confirmação;
- checkout com nome, telefone, forma de pagamento, observação e agendamento de encomendas;
- cálculo de preços exclusivamente no servidor;
- validação de telefone brasileiro, data, horário, quantidade e forma de pagamento;
- proteção contra pedidos duplicados com `Idempotency-Key`;
- rate limit e proteção contra spam no endpoint de pedidos;
- pedidos persistidos em PostgreSQL quando `DATABASE_URL` está configurada;
- estoque persistente e movimentado de forma transacional;
- pedidos do dia entram confirmados; encomendas dependem de aprovação;
- painel administrativo em `/admin`;
- login administrativo com sessão revogável em cookie `HttpOnly`;
- expiração de sessão, logout no servidor e limite de tentativas de login;
- cabeçalhos de segurança e CSP;
- Swagger/OpenAPI ocultos em produção;
- aviso de privacidade em `/privacidade`;
- melhorias de acessibilidade, foco e preferência por movimento reduzido;
- CI no GitHub Actions com compilação e testes automatizados.

## Tecnologias

- Python 3.11+
- FastAPI
- Uvicorn
- Pydantic
- PostgreSQL / Neon
- Psycopg
- HTML5
- CSS3 responsivo
- JavaScript sem framework
- Pytest
- GitHub Actions
- Vercel

## Como executar localmente

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ADMIN_USERNAME="vanuza"
export ADMIN_PASSWORD="crie-uma-senha-forte"
uvicorn src.p1_security:app --reload
```

No Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
$env:ADMIN_USERNAME="vanuza"
$env:ADMIN_PASSWORD="crie-uma-senha-forte"
uvicorn src.p1_security:app --reload
```

Por compatibilidade, `ADMIN_TOKEN` ainda pode ser usado no servidor como fallback de `ADMIN_PASSWORD`. O token nunca deve ser enviado pelo frontend.

Depois acesse:

- **Site:** `http://127.0.0.1:8000`
- **Painel da Vanuza:** `http://127.0.0.1:8000/admin`
- **Privacidade:** `http://127.0.0.1:8000/privacidade`
- **Swagger em desenvolvimento:** `http://127.0.0.1:8000/docs`
- **Health check:** `http://127.0.0.1:8000/health`

## Variáveis de ambiente principais

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL de pedidos, estoque e sessões administrativas |
| `ADMIN_USERNAME` | usuário do painel; padrão local: `vanuza` |
| `ADMIN_PASSWORD` | senha administrativa recomendada |
| `ADMIN_TOKEN` | fallback de compatibilidade no servidor |
| `ADMIN_SESSION_HOURS` | duração da sessão administrativa |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | limite de falhas de login por janela |
| `ADMIN_LOGIN_WINDOW` | janela do rate limit de login em segundos |
| `ORDER_RATE_LIMIT_MAX` | máximo de tentativas de pedido por janela |
| `ORDER_RATE_LIMIT_WINDOW` | janela do rate limit dos pedidos em segundos |
| `MIN_PREORDER_HOURS` | antecedência mínima de encomendas |
| `RATE_LIMIT_SALT` | salt adicional para hashes de limitação por cliente |

## Painel administrativo

O painel não grava a senha no navegador. O login envia as credenciais uma vez ao servidor e recebe uma sessão aleatória em cookie protegido. A sessão é armazenada de forma revogável e expira automaticamente.

As rotas administrativas de pedidos não aceitam mais a chave administrativa enviada diretamente pelo navegador. O segredo permanece apenas no ambiente do servidor.

## Fluxo dos pedidos

### Cardápio do dia

1. cliente escolhe os pratos disponíveis;
2. servidor recalcula preços e valida estoque;
3. estoque é baixado na mesma operação do pedido;
4. pedido entra como **Confirmado**;
5. painel permite avançar para **Em preparo**, **Pronto para retirada**, **Concluído** ou **Cancelado**.

### Encomendas

1. cliente escolhe produto, tamanho, data e horário;
2. servidor valida a antecedência e registra como **Aguardando aprovação**;
3. Vanuza aceita ou recusa no painel;
4. o estoque é reservado ao aceitar;
5. se a encomenda reservada for cancelada ou recusada, o estoque é devolvido.

## Endpoints principais

| Método | Endpoint | Função |
| --- | --- | --- |
| GET | `/api/info` | dados públicos do restaurante |
| GET | `/api/menu` | cardápio disponível conforme estoque |
| POST | `/api/orders` | cria pedido ou encomenda |
| POST | `/api/admin/login` | inicia sessão administrativa |
| GET | `/api/admin/session` | verifica sessão administrativa |
| POST | `/api/admin/logout` | encerra e revoga a sessão |
| GET | `/api/orders` | lista pedidos com sessão administrativa |
| PATCH | `/api/orders/{id}/status` | altera status com sessão administrativa |
| GET | `/brand/logo` | logo da marca |
| GET | `/privacidade` | aviso de privacidade |
| GET | `/health` | status do serviço |

O endpoint legado `POST /order` permanece apenas por compatibilidade com a estrutura original.

## Segurança

A camada atual inclui:

- preço recalculado no servidor;
- estoque transacional;
- idempotência e deduplicação;
- rate limit de pedidos;
- rate limit do login administrativo;
- sessão administrativa revogável;
- cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção;
- bloqueio do segredo administrativo enviado pelo cliente;
- CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e proteção contra framing;
- documentação de API oculta em produção.

## Privacidade

O checkout coleta somente os dados necessários para receber e acompanhar o pedido. O aviso de privacidade está disponível em `/privacidade` e informa finalidade, categorias de dados, armazenamento, infraestrutura, contato e direitos do titular.

Os registros devem ser mantidos apenas enquanto forem necessários às finalidades do atendimento e às obrigações aplicáveis, observadas as hipóteses legais de conservação.

## Estrutura principal

```text
api/
  index.py

assets/
data/

frontend/
  index.html
  styles.css
  app.js
  admin.html
  admin.css
  admin.js
  privacy.html
  privacy.css
  p1-enhancements.css
  p1-enhancements.js

src/
  app.py
  p1_security.py
  models/
  services/
    admin_auth.py
    order_hardening.py
    order_store.py

tests/
.github/workflows/
```

## Produção

Em produção, configure `DATABASE_URL` e uma senha administrativa forte no ambiente da Vercel. O armazenamento JSON existe somente como fallback de desenvolvimento; PostgreSQL é o armazenamento esperado para operação real.

O projeto utiliza `api/index.py` para preservar o caminho original das requisições após o rewrite da Vercel.

---

**Sabor da Casa by Vanuza**  
Da minha cozinha para sua família.
