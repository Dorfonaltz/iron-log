# REPTRIQ

Aplicativo pessoal de treino com visual powerlifting, ficha Push/Pull/Legs e acompanhamento dos três levantamentos de competição.

## Recursos

- PRs de agachamento livre, supino reto com barra e levantamento terra convencional.
- Total SBD automático.
- Registro de séries, cargas, repetições, volume e duração.
- Editor completo da ficha de treino.
- Sincronização online entre celular e computador.
- Chave privada de sincronização para uso independente do ChatGPT.
- Instalação como aplicativo (PWA) no celular e no computador.
- Cache local para continuar consultando os dados quando a conexão estiver indisponível.

## Desenvolvimento

```bash
npm ci
npm run dev
```

O projeto usa Vinext, React, Drizzle ORM e Cloudflare D1. Ele mantém compatibilidade com OpenAI Sites e também pode ser publicado como Cloudflare Worker independente.

## Sincronização independente

Na primeira abertura, o aplicativo gera uma chave aleatória de 128 bits. O servidor armazena somente o hash SHA-256 dessa chave. Para compartilhar os mesmos dados entre aparelhos, abra a faixa de sincronização e informe a mesma chave no celular e no computador.

## Banco de dados

O schema está em `db/schema.ts` e as migrações em `drizzle/`.

```bash
npm run db:generate
```
