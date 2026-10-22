import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { MenuLang } from '../types'

// O idioma do menu: um átomo (o desenho lê) e o `$.store` (vale nas próximas sessões).
const langAtom = atom({ plugin: 'menu', key: 'lang' } as const, 'pt')

export const LANGS: readonly { id: MenuLang; label: string }[] = [
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'English' },
]

export const isLang = (value: unknown): value is MenuLang => LANGS.some(l => l.id === value)

/** O idioma em vigor. */
export function lang($: EngineInterface): Promise<MenuLang> {
  return read($, langAtom)
}

/** Troca o idioma, para esta sessão e as próximas. */
export async function setLang($: EngineInterface, next: MenuLang): Promise<void> {
  await update($, langAtom, () => next)
  await $.store.set('lang', next)
}

/** Início de sessão: o idioma guardado numa sessão anterior. */
export async function restoreLang($: EngineInterface): Promise<void> {
  const kept = await $.store.get('lang')
  if (isLang(kept)) await update($, langAtom, () => kept)
}

/**
 * Todo texto que o menu desenha, nos dois idiomas. A chave é um nome; o português é o original.
 * Textos com partes variáveis são funções.
 */
export const MSG = {
  // Abas
  tabSessao: { pt: 'Sessão', en: 'Session' },
  tabTema: { pt: 'Tema', en: 'Theme' },
  tabFoco: { pt: 'Foco', en: 'Focus' },
  tabOrquestrador: { pt: 'Orquestrador', en: 'Orchestrator' },
  tabUso: { pt: 'Uso', en: 'Usage' },
  tabConfigs: { pt: 'Configs', en: 'Settings' },
  // Moldura
  keys: { pt: 'tab/setas movem · enter escolhe · roda rola · esc fecha', en: 'tab/arrows move · enter selects · wheel scrolls · esc closes' },
  language: { pt: 'Idioma', en: 'Language' },
  menuOpen: { pt: 'Menu aberto. Esc fecha.', en: 'Menu open. Esc closes.' },
  menuWaiting: { pt: 'Menu aberto, aguardando espaço: ', en: 'Menu open, waiting for room: ' },
  refused: { pt: 'recusado: ', en: 'refused: ' },
  // Sessão
  model: { pt: 'Modelo', en: 'Model' },
  modelDefault: { pt: '↺ padrão do Claude Code', en: '↺ Claude Code default' },
  effort: { pt: 'Effort', en: 'Effort' },
  wouldSend: { pt: (observed: string) => `(o Claude Code mandaria ${observed})`, en: (observed: string) => `(Claude Code would send ${observed})` },
  runningIn: { pt: 'Rodando em', en: 'Running in' },
  shiftTab: { pt: '· shift+tab troca', en: '· shift+tab cycles' },
  newSessions: { pt: 'Novas sessões começam em', en: 'New sessions start in' },
  now: { pt: '· agora', en: '· now' },
  actions: { pt: 'Ações', en: 'Actions' },
  compact: { pt: 'compactar', en: 'compact' },
  context: { pt: 'contexto', en: 'context' },
  cost: { pt: 'custo', en: 'cost' },
  compacted: { pt: 'compactado', en: 'compacted' },
  compactSkipped: { pt: 'compactação pulada: ', en: 'compaction skipped: ' },
  defaultModeSet: { pt: (mode: string) => `modo padrão → ${mode} (settings.json)`, en: (mode: string) => `default mode → ${mode} (settings.json)` },
  // Configs
  filter: { pt: 'filtro', en: 'filter' },
  filterHint: { pt: 'chave ou rótulo', en: 'key or label' },
  filterGo: { pt: 'filtrar', en: 'filter' },
  noMatch: { pt: 'nenhuma opção casa com o filtro', en: 'no option matches the filter' },
  panels: { pt: 'Painéis', en: 'Panels' },
  noPanels: { pt: 'nenhum painel disponível', en: 'no panel available' },
  save: { pt: 'gravar', en: 'save' },
  notANumber: { pt: (label: string, text: string) => `${label}: "${text}" não é um número`, en: (label: string, text: string) => `${label}: "${text}" is not a number` },
  // Abas dos mods
  configuration: { pt: 'Configuração', en: 'Configuration' },
  noConfiguration: { pt: 'sem configuração', en: 'no configuration' },
  notLoaded: { pt: (mod: string) => `${mod} não está carregado`, en: (mod: string) => `${mod} is not loaded` },
  main: { pt: 'principal', en: 'main' },
  active: { pt: (n: number) => `${n} ativo${n === 1 ? '' : 's'}`, en: (n: number) => `${n} active` },
  noAgents: { pt: 'nenhum agente ativo', en: 'no active agent' },
  sessionAgents: {
    pt: (n: number, tok: string) => `sessão: ${n} agente${n === 1 ? '' : 's'} · ${tok} tok`,
    en: (n: number, tok: string) => `session: ${n} agent${n === 1 ? '' : 's'} · ${tok} tok`,
  },
  failed: { pt: 'falhou', en: 'failed' },
  done: { pt: 'concluído', en: 'done' },
  zenInstall: {
    pt: '/plugin install zen@flcordis-mods: esconde as chamadas de tool e mostra uma faixa de progresso acima do prompt.',
    en: '/plugin install zen@flcordis-mods: hides tool calls and shows a progress band above the prompt.',
  },
  zenOn: { pt: '● ligado', en: '● on' },
  zenOff: { pt: '○ desligado', en: '○ off' },
  zenOnHint: { pt: 'as tools somem; a faixa acima do prompt mostra os passos', en: 'tools are hidden; the band above the prompt shows the steps' },
  zenOffHint: { pt: 'as tools aparecem como sempre', en: 'tools show as usual' },
  noTask: { pt: 'nenhuma tarefa na faixa', en: 'no task in the band' },
  noPlan: { pt: 'sem plano', en: 'no plan' },
  stepsOf: { pt: (done: number, total: number) => `${done} de ${total} passos`, en: (done: number, total: number) => `${done} of ${total} steps` },
  limitsWaiting: { pt: 'limites aguardando 1ª resposta', en: 'limits waiting for the 1st reply' },
  expiredAgo: { pt: (ago: string) => `expirado há ${ago}`, en: (ago: string) => `expired ${ago} ago` },
  tokToRewrite: { pt: 'tok a reescrever', en: 'tok to rewrite' },
  // Tema
  current: { pt: 'Atual', en: 'Current' },
  claudeCodesTheme: { pt: 'o do Claude Code', en: "Claude Code's" },
  rangeOf: { pt: (a: number, b: number, n: string) => `${a}–${b} de ${n}`, en: (a: number, b: number, n: string) => `${a}–${b} of ${n}` },
  themesCount: { pt: (n: string) => `${n} temas`, en: (n: string) => `${n} themes` },
  liveNotice: { pt: 'ao vivo: o foco num tema mostra a prévia, enter guarda', en: 'live: focus on a theme previews it, enter keeps it' },
  restartNotice: { pt: 'o primeiro tema pede reiniciar o Claude Code uma vez; depois é ao vivo', en: 'the first theme asks for one Claude Code restart; live after that' },
  wtOnly: { pt: ' · fundo do terminal só no Windows Terminal', en: ' · terminal background only in Windows Terminal' },
  search: { pt: 'Buscar', en: 'Search' },
  goghThemes: { pt: (n: string) => `${n} temas do Gogh`, en: (n: string) => `${n} Gogh themes` },
  themeName: { pt: 'nome do tema', en: 'theme name' },
  searchGo: { pt: 'buscar', en: 'search' },
  all: { pt: 'todos', en: 'all' },
  darkOnes: { pt: 'escuros', en: 'dark' },
  lightOnes: { pt: 'claros', en: 'light' },
  defaultDark: { pt: '◐ padrão escuro', en: '◐ default dark' },
  defaultLight: { pt: '◑ padrão claro', en: '◑ default light' },
  originalTheme: { pt: '↺ tema original', en: '↺ original theme' },
  downloadAgain: { pt: '⟳ baixar de novo', en: '⟳ download again' },
  downloading: { pt: 'Baixando os temas do Gogh…', en: 'Downloading the Gogh themes…' },
  downloadFailed: {
    pt: (why: string) => `Não deu para baixar os temas: ${why} (⟳ tenta de novo)`,
    en: (why: string) => `Could not download the themes: ${why} (⟳ retries)`,
  },
  unknownError: { pt: 'erro desconhecido', en: 'unknown error' },
  preview: { pt: 'prévia', en: 'preview' },
  noThemesYet: { pt: 'Nenhum tema baixado ainda: ⟳ baixar de novo.', en: 'No theme downloaded yet: ⟳ download again.' },
  themeSet: { pt: (name: string) => `tema → ${name}`, en: (name: string) => `theme → ${name}` },
  restartToActivate: { pt: 'reinicie o Claude Code uma vez para ativar; depois a troca é ao vivo', en: 'restart Claude Code once to activate; live after that' },
  wtNotChanged: { pt: 'fundo do terminal não mudou: ', en: 'terminal background unchanged: ' },
  nothingToRestore: { pt: 'o menu não trocou o tema do Claude Code: nada a restaurar nele', en: 'the menu never changed the Claude Code theme: nothing to restore' },
  themeBefore: { pt: (name: string) => `tema → ${name} (o de antes do menu)`, en: (name: string) => `theme → ${name} (the one before the menu)` },
  fromNextStart: { pt: 'vale a partir do próximo início do Claude Code', en: 'takes effect on the next Claude Code start' },
  wtNotRestored: { pt: 'fundo do terminal não voltou: ', en: 'terminal background not restored: ' },
  noThemeFor: { pt: (q: string) => `Nenhum tema com “${q}”.`, en: (q: string) => `No theme matching “${q}”.` },
} as const

export type MsgKey = keyof typeof MSG

/** O texto de uma chave no idioma. */
export function t<K extends MsgKey>(lang: MenuLang, key: K): (typeof MSG)[K][MenuLang] {
  return MSG[key][lang]
}
