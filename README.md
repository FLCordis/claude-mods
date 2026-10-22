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

Uma régua de uma linha **abaixo** da caixa de texto, na linha da dica `? for shortcuts`. O indicador de modo de permissão do próprio Claude Code (`⏵⏵ bypass permissions on`) continua no início dela:

```
⏵⏵ bypass permissions on  ? for shortcuts  │  Opus 5.5 xhigh meu-projeto  │  ctx 42% 84k/200k  │  5h 37% ↻ 2h30m · sem 92% ↻ 3d0h · sem fable 20% ↻ 3d0h  │  cache 41:23 · 84k tok
```

| Grupo | O que mostra |
| --- | --- |
| **sessão** | Modelo, nível de effort e o projeto (pasta raiz da sessão). |
| **ctx** | Porcentagem da janela de contexto e tokens usados / janela. Amarelo a partir de 70%, vermelho a partir de 90%. |
| **limites** | `5h` e `sem` (semanal) vêm nos headers de cada resposta da API. As janelas por modelo (`sem fable`, `sem opus`…) vêm do endpoint de uso da conta, o mesmo que o `/usage` consulta, lido a cada minuto com a credencial da sessão (o mod recebe só um handle; o segredo fica no host). Cada uma com o tempo até o reset (↻). |
| **cache** | Contagem regressiva até o prompt cache expirar. Verde, amarelo nos últimos 5 minutos e **vermelho** quando expira, avisando quantos tokens o próximo prompt vai reescrever. |

**Configuração.** Em `/config`, o campo `cacheTtlMinutes` define a validade do cache: `60` (padrão, assinatura) ou `5` (uso excedente ou API).

**Limitações.**

- O Claude Code não informa quando o cache expira. O mod marca a hora da última resposta da conversa principal e soma o TTL configurado.
- Os limites dos headers chegam com a primeira resposta da sessão; até lá a régua mostra "limites aguardando 1ª resposta". As janelas por modelo dependem de login na conta (não aparecem com chave de API ou gateway) e de `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` desligado; quando a consulta falha, o motivo aparece no lugar delas.
- Subagentes têm cache próprio e não renovam a contagem.
- A linha é desenhada no terminal e no desktop; a régua corta à direita quando a janela é estreita.

### orquestrador

A árvore de agentes e subagentes ativos, em dois lugares:

**Faixa acima do prompt** (padrão): uma caixa enquanto houver agente, e nada quando não há. Borda verde; amarela se algum agente passar de 80% de contexto, vermelha se algum falhar.

```
╭──────────────────────────────────────────────────────────────────────────────────────────────╮
│ ✻ orquestrador  2 ativos · 1 concluído                         2m10s · sessão 4 agentes · 412k tok │
│ 1 de 3 concluídos ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  33%              │
│ ● backend: API de agenda  savvy-heavy · Opus 5.5 · xhigh   ▸ Edit service.ts  9 tools · 2m10s · 61k tok  ████░░░░  58% │
│   ● Explorar schema do banco  Explore · Sonnet 5.5          · pensando…  3 tools · 22s · 12k tok  █░░░░░░░  12% │
│ ✔ Testes do hud  Explore                                              concluído · 38k tok · 1m02s │
╰──────────────────────────────────────────────────────────────────────────────────────────────╯
```

Título com a contagem e, à direita, o tempo desde o primeiro agente e o total da sessão; a barra mostra a fração de agentes concluídos; cada linha é um agente, com o estado alinhado à direita.

**Pane com cartões** à direita da transcrição (modo tela cheia), aberto por `/orq`, ou sozinho no primeiro agente com `placement: pane`:

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

Fora do painel: um toast quando um subagente passa de 80% do contexto, e uma linha de status (`⚙ 3 agentes · 412k tok`) quando, no modo `pane`, o painel não cabe na tela.

**Configuração.** Em `/config`: `placement` (`band`, padrão, ou `pane`), `doneLingerSeconds` (30), `contextWarnPercent` (80) e `columns` (48, largura do pane em tela cheia).

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
