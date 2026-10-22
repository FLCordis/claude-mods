// O mundo abaixo do mod, compartilhado pelos arquivos de teste.
import type { ConfigRow, On, RenderElement } from 'claude-code'
import type { Engine } from 'claude-code/testing'

export const PANE = {
  plugin: 'menu',
  component: 'Pane',
  requestId: 'menu',
  props: {
    title: 'menu',
    isFocused: true,
    bodyColumns: 72,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 24 },
    view: {},
  },
  viewport: { columns: 120, rows: 40, isFullscreen: true },
  surface: 'terminal',
} as const

/** A linha de dica sob o prompt, onde mora o botão do menu. */
export const HINT = {
  plugin: 'menu',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  viewport: { columns: 120, rows: 40, isFullscreen: true },
  surface: 'terminal',
} as const

export type WorldOptions = {
  /** As linhas que o /config lista. */
  config?: ConfigRow[]
  /** Variáveis de ambiente visíveis ao mod. */
  env?: Record<string, string>
  /** Comandos que a sessão tem (além do próprio /menu). */
  commands?: string[]
  /** O settings.json de usuário, ou `null` para arquivo ausente. */
  settingsText?: string | null
  /** O que o `$.store` já guarda. */
  store?: Record<string, unknown>
  /** Sem fundo para `command.run`: toda chamada rejeita. */
  noCommands?: boolean
  /** Sem fundo para `fs.read`: a leitura rejeita (o arquivo existe). */
  noFsRead?: boolean
  /** Sem fundo para `config.set`: toda gravação rejeita. */
  noConfigSet?: boolean
  /** `config.set` responde `{ deny }` com esta razão (uma linha que só o diálogo muda). */
  configDeny?: string
  /** O que o download do catálogo de temas responde: o corpo, ou um status de erro. */
  fetch?: { text: string } | { status: number }
  /** Arquivos que já existem no disco (além do settings.json de usuário). */
  files?: Record<string, string>
}

export type World = {
  panes: { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[]
  opens: unknown[]
  runs: { command: string; args: string }[]
  sets: { key: string; value: unknown }[]
  files: Record<string, string>
  store: Record<string, unknown>
  /** O effort com que cada `turn.step` chegou ao fundo, depois dos hooks. */
  steps: (string | number | undefined)[]
  /** O `tail` que a linha sob o prompt passou ao mod abaixo. */
  tails: string[]
  /** As URLs que o mod baixou. */
  fetches: string[]
}

/** O settings.json de usuário (o de `~/.claude`), e não o do Windows Terminal. */
const isUserSettings = (path: string) => /(^|\/)\.claude\/settings\.json$/.test(path)

/** O settings.json de usuário gravado pelo mod, ou undefined. */
export function settingsWritten(w: World): string | undefined {
  return Object.entries(w.files).find(([path]) => isUserSettings(path))?.[1]
}

/** Sessão, settings vazios, /config conforme pedido, pane sempre colocado. */
export function world(
  on: On,
  {
    config = [],
    env = {},
    commands = [],
    settingsText = null,
    store = {},
    noCommands = false,
    noFsRead = false,
    noConfigSet = false,
    configDeny,
    fetch,
    files = {},
  }: WorldOptions = {},
): World {
  const w: World = { panes: [], opens: [], runs: [], sets: [], files: { ...files }, store: { ...store }, steps: [], fetches: [], tails: [] }
  on('http.fetch', (_$, e) => {
    w.fetches.push(e.url)
    if (fetch === undefined) throw new Error('sem rede no teste')
    if ('status' in fetch) return { value: { status: fetch.status, ok: false, headers: {}, text: '' } }
    return { value: { status: 200, ok: true, headers: {}, text: fetch.text } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: 's1' }))
  on('store.delete', (_$, e) => {
    delete w.store[e.key]
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'menu' } }))
  on('session.model', () => ({ value: 'claude-fable-5-1' }))
  on('session.root', () => ({ value: 'C:/proj' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [] },
  }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', (_$, e) => ({ value: env[e.name] }))
  on('config.list', () => ({ value: config }))
  if (!noConfigSet) {
    on('config.set', (_$, e) => {
      if (configDeny !== undefined) return { deny: configDeny }
      w.sets.push({ key: e.key, value: e.value })
      return { value: e.value }
    })
  }
  on('command.list', () => ({
    value: [
      { name: 'menu', description: '', source: 'plugin' as const },
      ...commands.map(name => ({ name, description: '', source: 'builtin' as const })),
    ],
  }))
  // Sem fundo para command.run o engine rejeita a chamada: é a recusa que o menu mostra.
  if (!noCommands) {
    on('command.run', (_$, e) => {
      w.runs.push({ command: e.command, args: e.args })
      return {}
    })
  }
  // O engine entrega os caminhos com `\` no Windows: o mundo guarda tudo com `/`.
  const slash = (path: string) => path.replaceAll('\\', '/')
  on('fs.exists', (_$, e) => {
    const path = slash(e.path)
    return { value: path in w.files || (isUserSettings(path) && (settingsText !== null || noFsRead)) }
  })
  if (!noFsRead) {
    on('fs.read', (_$, e) => {
      const path = slash(e.path)
      if (path in w.files) return { value: w.files[path]! }
      if (!isUserSettings(path) || settingsText === null) throw new Error('ENOENT')
      return { value: settingsText }
    })
  }
  on('fs.write', (_$, e) => {
    w.files[slash(e.path)] = e.text
    return { value: undefined }
  })
  on('classic.UserPromptSubmit', () => ({}))
  on('store.get', (_$, e) => ({ value: w.store[e.key] }))
  on('store.set', (_$, e) => {
    w.store[e.key] = e.value
    return { value: undefined }
  })
  on('turn.step', async function* (_$, e) {
    w.steps.push(e.effort)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  // A linha de dica que o próprio engine desenharia: o nó dele, como o core responde.
  on('ui.render', { component: 'PromptHint' }, (_$, e) => {
    if (e.props.tail !== undefined) w.tails.push(e.props.tail)
    return { type: 'engine', ref: 0 } as RenderElement
  })
  on('ui.panes', () => ({ value: w.panes }))
  on('ui.open', (_$, e) => {
    w.opens.push(e)
    if (!w.panes.some(p => p.id === e.id)) {
      w.panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: true, isPlaced: true })
    }
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    const at = w.panes.findIndex(p => p.id === e.id)
    if (at >= 0) w.panes.splice(at, 1)
    return { value: undefined }
  })
  return w
}

export async function start($: Engine) {
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
}

/** `/menu` como a pessoa digita. */
export function menu($: Engine) {
  return $.command.run({ command: 'menu', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
}

/** Uma requisição da sessão principal com o effort que o engine mandaria. */
export async function step($: Engine, effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max') {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', effort, messageCount: 1 })
  for await (const _ of stream) {
    // só esgota o stream
  }
  return stream.result
}
