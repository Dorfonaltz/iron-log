# Iron Log

Aplicativo pessoal de treino com visual powerlifting, ficha Push/Pull/Legs e acompanhamento dos três levantamentos de competição.

## Recursos

- PRs de agachamento livre, supino reto com barra e levantamento terra convencional.
- Total SBD automático.
- Registro de séries, cargas, repetições, volume e duração.
- Editor completo da ficha de treino.
- Sincronização online entre celular e computador.
- Cache local para continuar consultando os dados quando a conexão estiver indisponível.

## Desenvolvimento

```bash
npm ci
npm run dev
```

O projeto usa Vinext, React, Drizzle ORM e Cloudflare D1. A hospedagem e as credenciais de infraestrutura são gerenciadas pelo OpenAI Sites.

## Banco de dados

O schema está em `db/schema.ts` e as migrações em `drizzle/`.

```bash
npm run db:generate
```
