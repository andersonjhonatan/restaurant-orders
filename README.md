# Sabor da Casa

<p align="center">
  <img src="assets/logo-sabor-da-casa.svg" alt="Logo Sabor da Casa by Vanuza" width="260" />
</p>

API de cardápio e pedidos do **Sabor da Casa**, administrado por **Vanuza**.

> **Slogan:** Da minha cozinha para sua família.

## Contato

- **Responsável:** Vanuza
- **WhatsApp:** 87 98839-5085
- **Link direto:** https://wa.me/5587988395085

## Tecnologias

- Python
- FastAPI
- Uvicorn
- Pytest

## Como executar

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --app-dir src --reload
```

Depois acesse:

- API: `http://127.0.0.1:8000`
- Informações da empresa: `http://127.0.0.1:8000/info`
- Documentação Swagger: `http://127.0.0.1:8000/docs`

## Endpoints principais

- `GET /` — retorna o cardápio.
- `GET /info` — retorna nome, responsável, slogan, WhatsApp e endereço da logo.
- `GET /brand/logo` — disponibiliza a logo oficial da marca.
- `POST /order` — registra o pedido de um prato.

## Estrutura

```text
assets/       identidade visual da marca
data/         dados de cardápio e estoque
src/          aplicação e regras de negócio
tests/        testes automatizados
```

---

**Sabor da Casa by Vanuza**  
Da minha cozinha para sua família.
