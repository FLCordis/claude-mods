# claude-mods

Repositório pessoal de mods do Claude Code (plugins de *function hooks*), publicado em https://github.com/FLCordis/claude-mods (público, MIT). Não é trabalho da Reconecta: sem task na Esteira, sem nota no Brain, sem changelog.

Trabalhe e documente em PT-BR.

## Estrutura

- `.claude-plugin/marketplace.json`: o marketplace `flcordis-mods`, com uma entrada por mod em `plugins` (`name`, `source: "./mods/<nome>"`, `description`).
- `mods/<nome>/`: um mod por pasta, com `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx` (ou `.ts`), `types/index.d.ts` quando usa `$.state` e `tests/*.test.ts`.
- `README.md`: instalação e uma seção por mod (o que mostra, configuração, limitações).

## Criar um mod

1. Carregue a skill `plugin-authoring` antes de escrever qualquer código. Ela diz onde o mod nasce (a pasta de dev-mods desta sessão, com recarga automática) e onde estão os tipos da API deste build.
2. Desenvolva e ajuste nessa pasta até o Flávio aprovar o resultado.
3. Escreva pelo menos um teste do comportamento pedido.

## Trazer um mod para o repositório

1. Copie a pasta do mod para `mods/<nome>/`, sem `.claude-plugin/types/` (gerado pelo Claude Code e ignorado no Git).
2. No `plugin.json`, inclua `author` (`Flávio Magalhães`, `https://github.com/FLCordis`), `repository` e `license: "MIT"`.
3. Adicione a entrada em `.claude-plugin/marketplace.json` e uma seção no `README.md`, seguindo a do `terminal-hud`.
4. Verifique antes do commit:
   ```
   claude plugin validate .
   claude plugin validate mods/<nome>
   claude plugin test mods/<nome>
   ```
5. Faça commit em `main` (mensagem em PT-BR, estilo `feat: <mod> ...`) e push quando o Flávio pedir para subir.

## Instalação

- Para outras pessoas: `/plugin install <mod> --marketplace FLCordis/claude-mods`.
- Nesta máquina, o marketplace aponta para esta pasta (`claude plugin marketplace add C:\Users\flavio\claude-mods`): depois de editar um mod instalado, `/reload-plugins` já aplica.
