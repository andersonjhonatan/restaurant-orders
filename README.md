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
- controle de estoque e montagem de cardápio que estavam incompletos no projeto original;
- CI no GitHub Actions com compilação e testes automatizados.

## Tecnologias

- Python
- FastAPI
- Uvicorn
- Pydantic
- HTML5
- CSS3 responsivo
- JavaScript sem framework
- Pytest
- GitHub Actions

## Como executar

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ADMIN_TOKEN="crie-uma-senha-forte"
uvicorn src.app:app --reload
```

No Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
$env:ADMIN_TOKEN="crie-uma-senha-forte"
uvicorn src.app:app --reload
```

Depois acesse:

- **Site:** `http://127.0.0.1:8000`
- **Painel da Vanuza:** `http://127.0.0.1:8000/admin`
- **Swagger:** `http://127.0.0.1:8000/docs`
- **Health check:** `http://127.0.0.1:8000/health`

## Painel administrativo

O painel exige a variável de ambiente `ADMIN_TOKEN`. Não existe senha administrativa padrão gravada no repositório. Isso evita que um projeto público no GitHub exponha o acesso aos pedidos dos clientes.

Ao abrir `/admin`, informe exatamente o mesmo valor configurado em `ADMIN_TOKEN` no servidor.

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
.github/workflows/
```

## Produção

O armazenamento JSON funciona para demonstração, desenvolvimento local e operação de volume muito baixo em um único processo. Para disponibilizar o Sabor da Casa publicamente com segurança e múltiplos acessos, o próximo passo é usar um banco persistente como PostgreSQL, autenticação de painel e backup. Em plataformas serverless, não use `data/orders.json` como banco definitivo.

---

**Sabor da Casa by Vanuza**  
Da minha cozinha para sua família.
