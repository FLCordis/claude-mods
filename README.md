# claude-mods

Mods para o [Claude Code](https://claude.com/claude-code): plugins de *function hooks* que desenham na interface e reagem a eventos da sessão.

## Instalação

Na prompt de uma sessão do Claude Code no terminal:

```
/plugin install terminal-hud --marketplace FLCordis/claude-mods
/plugin install orquestrador --marketplace FLCordis/claude-mods
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

### orquestrador

Um painel encostado à direita da transcrição (modo tela cheia) com a árvore de agentes e subagentes ativos. Abre sozinho no primeiro agente da sessão; `/orq` abre e fecha na mão.

```
❯ orquestrador                       2 ativos · 1 concluído
 ● principal                          Fable 5.1 · high
 ctx ████████░░░░░░░░░░░░░░░░░░░  27%  272k / 1M
╭──────────────────────────────────────────────────────╮
│ ● backend: API de agenda                        2m10s │
│ savvy-heavy · Opus 5.5 · xhigh      9 tools · 61k tok │
│ ▸ Edit service.ts                                tool │
│ ctx ████████████░░░░░░░░░░░░░░░░  58%  116k / 200k    │
╰──────────────────────────────────────────────────────╯
  ╭────────────────────────────────────────────────────╮
  │ ● Explorar schema do banco                     22s │
  │ Explore · Sonnet 5.5 · medium     3 tools · 12k tok │
  │ · pensando…                                 modelo │
  │ ctx ███░░░░░░░░░░░░░░░░░░░░░░░░░  12%  24k / 200k  │
  ╰────────────────────────────────────────────────────╯
  ✔ Testes do hud            38k tok · 1m02s · 4 reads · 1 edits
──────────────────────────────────────────────────────────
 sessão                                 4 agentes · 412k tok
```

| Parte | O que mostra |
| --- | --- |
| **cabeçalho** | Quantos agentes rodam e quantos concluíram ainda à vista. |
| **principal** | Modelo e effort da sessão, e a barra de contexto dela. |
| **cartão** | Um por agente em andamento, com a borda na cor do tipo (cada tipo ganha uma cor na primeira vez que aparece). Linha 1: a descrição que o orquestrador deu e o tempo rodando. Linha 2: tipo, modelo e effort; tools chamadas e tokens gastos. Linha 3: a tool em voo (`▸ Grep schema.prisma`) ou `pensando…`. Linha 4: contexto usado na última requisição, amarelo a partir de 70%, vermelho a partir de 90%. |
| **recuo** | Subagente de um agente recua duas colunas por nível: a árvore mostra de quem cada um nasceu. |
| **concluído** | Vira uma linha apagada com `✔`, custo final, duração e contagem de reads/edits; falha vira `✖` vermelho com toast. Some depois de 30 segundos. |
| **rodapé** | Total de agentes e tokens da sessão, somando os que já sumiram. |

Fora do painel: um toast quando um subagente passa de 80% do contexto, e uma linha de status (`⚙ 3 agentes · 412k tok`) quando o painel não cabe na tela.

**Configuração.** Em `/config`: `doneLingerSeconds` (30), `contextWarnPercent` (80) e `columns` (48, largura do painel em tela cheia).

**Limitações.**

- Não há progresso real: o Claude Code não diz quanto falta para um agente terminar. O que aparece é o proxy tools · tempo · tokens e o estado (tool ou modelo).
- A janela de contexto de um subagente não é informada. O mod assume 1M para modelos com `[1m]` no nome e 200k para os demais.
- No terminal, o painel encosta ao lado da transcrição só em tela cheia com 110 colunas ou mais (144 quando abre sozinho, até o primeiro `/orq` da sessão). Fora disso aparece acima do prompt.
- Agentes que não passam pela tool Agent (um fork de skill) entram pela reconciliação de 5 em 5 segundos, sem modelo até a primeira resposta.

## Desenvolvimento

Cada mod é uma pasta em `mods/` com `.claude-plugin/plugin.json`, `hooks/hooks.json` e o módulo de hooks. Para editar e ver o resultado nas suas sessões, cadastre o clone como marketplace local:

```
claude plugin marketplace add <caminho-do-clone>
claude plugin install terminal-hud@flcordis-mods
```

O Claude Code lê o mod direto da pasta: edite e rode `/reload-plugins`.

Verificações:

```
claude plugin validate mods/<nome>
claude plugin test mods/<nome>
```

Para adicionar um mod, crie a pasta em `mods/` e inclua uma entrada em `.claude-plugin/marketplace.json`.

## Licença

[MIT](LICENSE)
