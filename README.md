# claude-mods

Mods para o [Claude Code](https://claude.com/claude-code): plugins de *function hooks* que desenham na interface e reagem a eventos da sessão.

## Instalação

Na prompt de uma sessão do Claude Code no terminal:

```
/plugin install terminal-hud --marketplace FLCordis/claude-mods
/plugin install orquestrador --marketplace FLCordis/claude-mods
/plugin install zen --marketplace FLCordis/claude-mods
/plugin install menu --marketplace FLCordis/claude-mods
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

**Configuração.** Ao instalar, o Claude Code pergunta o único campo do mod, `cacheTtlMinutes` (TTL do cache, em minutos). Pode deixar em branco: vale o padrão, `60`, que é a validade do cache na assinatura. Coloque `5` só em uso excedente ou via API. Dá para mudar depois em `/config` ou na aba Uso do menu.

**Limitações.**

- O Claude Code não informa quando o cache expira. O mod marca a hora da última resposta da conversa principal e soma o TTL configurado.
- Os limites dos headers chegam com a primeira resposta da sessão; até lá a régua mostra "limites aguardando 1ª resposta". As janelas por modelo dependem de login na conta (não aparecem com chave de API ou gateway) e de `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` desligado; quando a consulta falha, o motivo aparece no lugar delas.
- Subagentes têm cache próprio e não renovam a contagem.
- A linha é desenhada no terminal e no desktop; a régua corta à direita quando a janela é estreita.
- Outros mods podem desenhar na mesma linha, depois da régua (o botão `◆ menu` fica na ponta direita): a régua encolhe para tudo caber numa linha só.

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

### zen

Modo Zen: as chamadas de tool e o que elas devolvem somem da transcrição (ficam só as mensagens de texto do Claude), e uma faixa **acima** do prompt mostra o andamento:

```
╭──────────────────────────────────────────────────────────────────────────╮
│ ✶ Refatorar o menu                                            1m12s  [–] │
│ passo 2 de 4   ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   50% │
│ ● Ler os arquivos do menu                                          feito │
│ ◉ Reescrever a moldura                                             agora │
│ ○ Atualizar os testes                                             depois │
│ ○ Atualizar o README                                              depois │
╰──────────────────────────────────────────────────────────────────────────╯
```

| Parte | Como funciona |
| --- | --- |
| **Faixa** | Cada rodada da sessão principal abre uma tarefa com o prompt como título, o tempo decorrido e uma barra de progresso. No fim a faixa marca concluído (ou interrompido, num Esc ou erro) e some alguns segundos depois. `[–]` recolhe numa linha, `[+]` abre de novo. |
| **Passos** | Com o Zen ligado, cada prompt digitado leva ao Claude uma instrução (nunca mostrada) para manter o plano por uma tool própria, `mcp__zen__progress`, com o plano inteiro a cada chamada. A lista de tarefas do próprio Claude Code (TodoWrite, TaskCreate, TaskUpdate) também move a faixa. Subagentes não mexem nela. |
| **Tools escondidas** | `ToolUse`, `ToolResult`, `ToolProgress` e grupos recolhidos não são desenhados; um grupo expandido com ctrl+o aparece. |

**Configuração.** Ao instalar, o Claude Code pergunta `enabled` (ligado ou não; padrão desligado) e `bandColor` (`acento`, `azul`, `verde`, `roxo` ou `arco-iris`). Os dois também estão na aba Foco do menu e no `/config`; ligar ou desligar recarrega o mod.

**Limitações.**

- A faixa depende do Claude chamar a tool: num prompt que ele resolve sem plano, fica só o título, o tempo e a barra em 0% até o fim.
- Desligado, o mod não registra a tool nem muda o prompt: nada do Zen chega ao Claude.
- Com uma pesquisa de satisfação do Claude Code acima do prompt, a faixa cede a linha.

### menu

Uma janela com abas, aberta pelo botão `◆ menu ▲` na ponta direita da linha **sob** o prompt (depois da régua do terminal-hud), ou por `/menu` (`/menu tema` abre direto numa aba; os nomes em inglês e os antigos, `zen` e `hud`, também valem). O mesmo botão fecha (`▼`). As abas são desenhadas como as de um navegador: a ativa numa caixa que se emenda na régua, as outras só em texto, e `esc ×` na ponta. Abre com o teclado nela (Tab e setas andam, Enter escolhe, a aba ativa já vem focada) e Esc ou `esc ×` fecha. A janela tem sempre a mesma altura, em toda aba, para os botões não mudarem de lugar entre um clique e outro. Em tela cheia com 110 colunas ou mais ela encosta ao lado da transcrição; fora disso aparece acima do prompt. A última aba aberta e o idioma (Português ou English, no rodapé) são lembrados entre sessões.

```
  ╭──────────╮
  │ ◆ Sessão │  Tema  Foco  Orquestrador  Uso  Configs                  esc ×
──╯          ╰──────────────────────────────────────────────────────────────
 claude-mods · claude-fable-5-1 · ctx 12%

 Modelo
 ╭───────╮ ╭──────╮ ╭────────╮ ╭───────╮
 │ Fable │ │ Opus │ │ Sonnet │ │ Haiku │   ↺ padrão do Claude Code  Fable 5.1
 ╰───────╯ ╰──────╯ ╰────────╯ ╰───────╯

 Effort ▰▰▰▱▱ high
 ╭─────╮ ╭────────╮ ╭──────╮ ╭───────╮ ╭─────╮
 │ low │ │ medium │ │ high │ │ xhigh │ │ max │
 ╰─────╯ ╰────────╯ ╰──────╯ ╰───────╯ ╰─────╯

 Rodando em
 plan · shift+tab troca

 Novas sessões começam em
 ╭─────────────╮ ╭──────╮ ╭──────────────╮ ╭──────╮ ╭────────────────────╮
 │ ask · agora │ │ plan │ │ accept edits │ │ auto │ │ bypass permissions │
 ╰─────────────╯ ╰──────╯ ╰──────────────╯ ╰──────╯ ╰────────────────────╯

 Ações
 ╭───────────╮ ╭──────────╮ ╭───────╮
 │ compactar │ │ contexto │ │ custo │
 ╰───────────╯ ╰──────────╯ ╰───────╯

 effort → high
────────────────────────────────────────────────────────────────────────────
          ╭───────────╮ ╭─────────╮
 Idioma   │ Português │ │ English │
          ╰───────────╯ ╰─────────╯
 tab/setas movem · enter escolhe · roda rola · esc fecha
```

A aba **Tema**:

```
 Atual Tokyo Night                                              1–15 de 1.250
 ao vivo: o foco num tema mostra a prévia, enter guarda
 Buscar: tokyo
 ● todos  ○ escuros  ○ claros
 ◐ padrão escuro  ◑ padrão claro  ↺ tema original  ⟳ baixar de novo  /theme
 ■■■■■■■ Tokyo Night ✓
 ■■■■■■■ Tokyo Night Light ☀
 ■■■■■■■ Tokyo Night Storm prévia
```

| Aba | O que mostra |
| --- | --- |
| **Sessão** | Modelo (clique troca, via `/model`). Effort: o escolhido vale para cada requisição da sessão (o mod reescreve o effort no hook `turn.step`), fica guardado para as próximas sessões e, quando o `/config` tem a linha, ela é atualizada junto. O modo de permissão em vigor (só leitura: shift+tab troca) e o modo com que **novas sessões** começam (grava `permissions.defaultMode` no `settings.json` de usuário, preservando o resto). Ações: compactar, `/context` e `/cost`. |
| **Tema** | Os 1.250 temas do [Gogh](https://github.com/Gogh-Co/Gogh) (Dracula, Nord, Catppuccin, Tokyo Night, Gruvbox…), baixados uma vez para `~/.claude/menu/gogh-themes.json`. Busca, filtro claro/escuro e uma lista com amostras das cores que rola sozinha (roda do mouse, setas, ou o foco andando por ela). Clique ou Enter num tema aplica: vira o tema customizado `~/.claude/themes/menu.json` (todos os tokens de cor do Claude Code, ajustados para ler no fundo) e fica em vigor como `custom:menu`. Com o foco parado num tema, a **prévia** pinta na hora sem guardar; fechar o menu ou sair da aba volta ao tema guardado. No **Windows Terminal**, o perfil da aba recebe o esquema `claude-menu` com o fundo do tema, e volta ao esquema dele quando a sessão termina. Também: padrão escuro/claro (o tema base, ao vivo), voltar ao tema de antes do menu e o seletor nativo `/theme`. |
| **Foco** | Liga e desliga o mod `zen` e escolhe a cor da faixa (linhas `zen.*` do `/config`, uma linha por cor com a amostra e ✓ na escolhida), e mostra a tarefa que a faixa acompanha. |
| **Orquestrador** | A sessão principal e uma linha por agente (recuo por nível, `✔`/`✖` para concluído/falhou), lidas do estado do mod orquestrador, e abaixo as configurações dele. |
| **Uso** | Modelo, effort e projeto, barra de contexto, os limites (`5h 37% ↻ 2h20m`, `sem fable 20%`) e o cache, lidos do estado do terminal-hud, e abaixo as configurações dele. |
| **Configs** | Um filtro e todas as linhas do `/config`, agrupadas por dono (Claude Code primeiro, depois cada plugin): booleano vira chip on/off, escolha vira chips (ou um seletor quando há muitas), número e texto viram campo com Enter para gravar; linha travada por política aparece com 🔒. No fim, chips que fecham o menu e abrem os painéis nativos (`plugins`, `permissions`, `mcp`, `hooks`, `memory`, `usage`…), só os que a sessão tem. |

Toda ação deixa uma linha de nota acima do rodapé (`modelo → opus`, `modo padrão → plan (settings.json)`, `tema → Nord`, `recusado: …`). Antes da primeira gravação no `settings.json` do Claude Code ou do Windows Terminal, o mod guarda uma cópia ao lado, em `settings.json.menu.bak`.

**Limitações.**

- Não há API para trocar o modo de permissão da sessão em andamento: a aba mostra o modo atual e o shift+tab continua sendo o caminho. O que o menu grava é o modo das próximas sessões.
- O clique no botão `◆ menu` funciona no terminal em tela cheia (onde o Claude Code repassa cliques); fora dela, use `/menu`.
- **Tema, primeira vez:** o Claude Code só passa a acompanhar o arquivo `~/.claude/themes/menu.json` quando o tema `custom:menu` já estava em vigor ao iniciar. A primeira escolha grava `theme: "custom:menu"` no `settings.json` e pede para reiniciar o Claude Code uma vez; daí em diante toda troca (e a prévia) é ao vivo. Trocar o tema pelo `/theme` desliga isso até a próxima escolha no menu.
- **Windows Terminal:** o mod reescreve o `settings.json` do WT (comentários do arquivo não são mantidos; o original fica no `.menu.bak`). Um perfil com `background` próprio ignora o fundo do esquema. Várias sessões no mesmo perfil dividem o esquema, e o original volta quando a última delas fecha (uma sessão que caiu sem fechar deixa de contar depois de 3 minutos). Fora do Windows Terminal só as cores do Claude Code mudam.
- As abas Foco, Orquestrador e Uso precisam dos mods instalados (zen, orquestrador e terminal-hud; a aba diz qual); sem eles, a aba diz que o mod não está carregado (as configurações continuam editáveis).
- Comandos e painéis rodam quando a sessão fica ociosa; numa recusa, o menu fica aberto e a nota mostra a razão.
- No celular (Claude Code mobile) os campos de texto viram só leitura; o resto funciona por toque.

**Créditos.** Os temas são do [Gogh](https://github.com/Gogh-Co/Gogh) (MIT), cada um dos seus autores. O botão sob o prompt, a troca de tema ao vivo pelo arquivo customizado, o fundo do Windows Terminal e o modo Zen foram inspirados no [ClaudeMods de Jhonatan de Souza](https://github.com/Jhonatan-de-Souza/ClaudeMods); o código aqui é próprio.

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
