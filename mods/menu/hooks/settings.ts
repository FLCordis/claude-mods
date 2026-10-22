import type { EngineInterface } from 'claude-code'

import { lang, t } from './i18n'

/** Os modos de permissão do Claude Code, com o rótulo que o menu desenha. */
export const MODES: readonly { id: string; label: string }[] = [
  { id: 'default', label: 'ask' },
  { id: 'plan', label: 'plan' },
  { id: 'acceptEdits', label: 'accept edits' },
  { id: 'auto', label: 'auto' },
  { id: 'bypassPermissions', label: 'bypass permissions' },
  { id: 'dontAsk', label: 'dont ask' },
]

export function modeLabel(id: string | null): string {
  if (id === null) return '—'
  return MODES.find(m => m.id === id)?.label ?? id
}

/** O settings.json lido como objeto; texto vazio vale como `{}`; inválido lança com a razão. */
export function parseSettings(text: string): Record<string, unknown> {
  let parsed: unknown = {}
  if (text.trim() !== '') {
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw new Error(`settings.json inválido: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('settings.json inválido: a raiz não é um objeto')
  }
  return { ...(parsed as Record<string, unknown>) }
}

/** O settings.json com uma chave de primeiro nível trocada (`theme`); as outras ficam como estão. */
export function withSetting(text: string, key: string, value: unknown): string {
  const settings = parseSettings(text)
  settings[key] = value
  return JSON.stringify(settings, null, 2) + '\n'
}

/**
 * O settings.json com `permissions.defaultMode` trocado: as outras chaves ficam como estão.
 * Texto vazio vale como `{}`; `default` apaga a chave (e `permissions`, se ficar vazio).
 */
export function withDefaultMode(text: string, mode: string): string {
  const settings = parseSettings(text)
  const current = settings.permissions
  const permissions: Record<string, unknown> =
    current !== null && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {}

  if (mode === 'default') delete permissions.defaultMode
  else permissions.defaultMode = mode

  if (Object.keys(permissions).length === 0) delete settings.permissions
  else settings.permissions = permissions

  return JSON.stringify(settings, null, 2) + '\n'
}

/** A pasta de configuração do Claude Code, com `/`: `CLAUDE_CONFIG_DIR`, senão `~/.claude`. */
export async function configDir($: EngineInterface): Promise<string> {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  if (custom !== undefined && custom !== '') return custom.replaceAll('\\', '/')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  return `${home.replaceAll('\\', '/')}/.claude`
}

/** O settings.json de usuário, dentro de `configDir`. */
export async function settingsPath($: EngineInterface): Promise<string> {
  return `${await configDir($)}/settings.json`
}

/**
 * Reescreve o settings.json de usuário com `change` aplicado ao texto atual. Só um arquivo
 * ausente vale como vazio: uma leitura que falha lança e nada é gravado. Antes da primeira
 * gravação do mod, uma cópia do original fica em `settings.json.menu.bak`.
 */
async function rewriteUserSettings($: EngineInterface, change: (text: string) => string): Promise<void> {
  const path = await settingsPath($)
  const text = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  const next = change(text)
  const backup = `${path}.menu.bak`
  if (!(await $.fs.exists(backup))) await $.fs.write(backup, text)
  await $.fs.write(path, next)
}

/** Grava o modo padrão das novas sessões e devolve a nota para o menu; lança quando não pode gravar. */
export async function writeDefaultMode($: EngineInterface, mode: string): Promise<string> {
  await rewriteUserSettings($, text => withDefaultMode(text, mode))
  return t(await lang($), 'defaultModeSet')(modeLabel(mode))
}

/** Grava uma chave de primeiro nível do settings.json de usuário; lança quando não pode gravar. */
export async function writeUserSetting($: EngineInterface, key: string, value: unknown): Promise<void> {
  await rewriteUserSettings($, text => withSetting(text, key, value))
}
