# P2 — Estoque e receitas

O painel administrativo passa a controlar estoque, alertas e receitas por prato.

## Regras operacionais

- Ajustes manuais sempre ficam registrados no histórico.
- O saldo não pode ficar negativo.
- Cada ingrediente pode ter um limite próprio de estoque baixo.
- A receita de estoque de um prato define o consumo da opção-base.
- Cada opção/tamanho pode ter um multiplicador explícito de consumo.
- Um prato novo é criado inativo quando ainda não possui receita de estoque.
- Um prato sem receita não pode ser ativado.
- Pedidos continuam usando a transação de estoque implementada no P0.

## Unidades

As quantidades atuais são unidades de controle herdadas da base existente. Para controle contábil exato, as receitas devem ser ajustadas no painel conforme as quantidades reais utilizadas pela cozinha.
