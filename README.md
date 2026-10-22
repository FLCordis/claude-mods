# claude-mods

Mods para o [Claude Code](https://claude.com/claude-code): plugins de *function hooks* que desenham na interface e reagem a eventos da sessão.

## Instalação

Na prompt de uma sessão do Claude Code no terminal:

```
/plugin install terminal-hud --marketplace FLCordis/claude-mods
```

Responda `y` para adicionar o marketplace e escolha o escopo (o de usuário vale para todas as sessões). O mod passa a valer na hora, sem reiniciar.

## Mods

### terminal-hud

Uma faixa acima do prompt com quatro blocos em bordas de terminal:

```
╭──────────────────────────╮ ╭───────────────╮ ╭───────────────────────────╮ ╭──────────────────────╮
│ ❯ sessão                 │ │ ❯ contexto    │ │ ❯ uso                     │ │ ❯ cache              │
│ Opus 5.5 · effort xhigh  │ │ 84k / 200k    │ │ 5h  ▰▰▰▱▱▱▱▱ 37% ↻ 2h30m  │ │ ⏱ expira em 41:23    │
│ proj meu-projeto         │ │ ▰▰▰▰▱▱▱▱▱▱ 42%│ │ sem ▰▰▰▰▰▰▰▱ 92% ↻ 3d0h   │ │ 84k tok em cache     │
╰──────────────────────────╯ ╰───────────────╯ ╰───────────────────────────╯ ╰──────────────────────╯
```

| Bloco | O que mostra |
| --- | --- |
| **sessão** | Modelo, nível de effort e o projeto (pasta raiz da sessão). |
| **contexto** | Tokens usados / janela total, com barra. Amarelo a partir de 70%, vermelho a partir de 90%. |
| **uso** | Uso da janela de 5 horas e da semanal, com o tempo até cada reset (↻). |
| **cache** | Contagem regressiva até o prompt cache expirar. Verde, amarelo nos últimos 5 minutos e **vermelho** quando expira, avisando que o próximo prompt vai reescrever o cache. |

**Configuração.** Em `/config`, o campo `cacheTtlMinutes` define a validade do cache: `60` (padrão, assinatura) ou `5` (uso excedente ou API).

**Limitações.**

- O Claude Code não informa quando o cache expira. O mod marca a hora da última resposta da conversa principal e soma o TTL configurado.
- Os limites de 5h e semanal chegam com a resposta da API. Até a primeira resposta da sessão, o bloco mostra "aguardando 1ª resposta".
- Subagentes têm cache próprio e não renovam a contagem.

## Desenvolvimento

Cada mod é uma pasta em `mods/` com `.claude-plugin/plugin.json`, `hooks/hooks.json` e o módulo de hooks. Para editar e ver o resultado nas suas sessões, cadastre o clone como marketplace local:

```
claude plugin marketplace add <caminho-do-clone>
claude plugin install terminal-hud@flcordis-mods
```

O Claude Code lê o mod direto da pasta: edite e rode `/reload-plugins`.

Verificações:

```
claude plugin validate mods/terminal-hud
claude plugin test mods/terminal-hud
```

Para adicionar um mod, crie a pasta em `mods/` e inclua uma entrada em `.claude-plugin/marketplace.json`.

## Licença

[MIT](LICENSE)
