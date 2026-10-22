// Funções puras do painel: a ordem da árvore e o resumo de uma chamada de tool.
import type { AgentRow } from '../types'
import { basename, clip } from './format'

export type TreeLine = {
  row: AgentRow
  depth: number
  /** Conector da primeira linha do agente: `├ ` ou `└ `, precedido pelas guias dos ancestrais. */
  prefix: string
  /** Guias para as linhas seguintes do mesmo agente: `│ ` onde ainda vêm irmãos, espaço onde não. */
  guide: string
}

const rank = (row: AgentRow) => (row.status === 'running' ? 0 : 1)

/**
 * Percorre a árvore pelo `parentId` a partir das raízes (sem pai, ou pai que
 * não está no mapa). Em cada nível, os que rodam vêm antes dos concluídos e,
 * entre iguais, o mais antigo primeiro.
 */
export function orderTree(agents: Record<string, AgentRow>): TreeLine[] {
  const all = Object.values(agents)
  const ids = new Set(all.map(a => a.id))
  const children = new Map<string | undefined, AgentRow[]>()
  for (const row of all) {
    const parent = row.parentId !== undefined && ids.has(row.parentId) && row.parentId !== row.id ? row.parentId : undefined
    const list = children.get(parent) ?? []
    list.push(row)
    children.set(parent, list)
  }

  const out: TreeLine[] = []
  const seen = new Set<string>()
  const walk = (parent: string | undefined, guides: string, depth: number) => {
    const list = (children.get(parent) ?? []).sort((x, y) => rank(x) - rank(y) || x.startedAt - y.startedAt)
    list.forEach((row, i) => {
      if (seen.has(row.id)) return
      seen.add(row.id)
      const isLast = i === list.length - 1
      const guide = guides + (isLast ? '  ' : '│ ')
      out.push({ row, depth, prefix: guides + (isLast ? '└ ' : '├ '), guide })
      walk(row.id, guide, depth + 1)
    })
  }
  walk(undefined, '', 0)
  return out
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

/**
 * `Grep schema.prisma`, `Bash npm test`, `Edit service.ts`: a tool e o pedaço
 * do input que identifica a chamada, curto o bastante para uma linha.
 */
export function shortTool(call: { tool: string } & Record<string, unknown>, max = 40): string {
  const name = call.tool.startsWith('mcp__') ? (call.tool.split('__').pop() ?? call.tool) : call.tool
  let arg: string | undefined
  switch (call.tool) {
    case 'Bash':
    case 'PowerShell': {
      const first = (str(call.command) ?? '').split(/\r?\n|&&|\|\||;|\|/)[0] ?? ''
      arg = first.trim().split(/\s+/).slice(0, 2).join(' ')
      break
    }
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      arg = str(call.file_path) ?? str(call.notebook_path)
      if (arg !== undefined) arg = basename(arg)
      break
    case 'Grep':
    case 'Glob':
      arg = str(call.pattern)
      break
    case 'Agent':
      arg = str(call.description)
      break
    case 'WebFetch':
      arg = host(str(call.url))
      break
    case 'WebSearch':
      arg = str(call.query)
      break
    case 'Skill':
      arg = str(call.skill)
      break
    default:
      arg = str(call.description) ?? str(call.query) ?? str(call.path) ?? str(call.file_path)
  }
  return clip(arg ? `${name} ${arg}` : name, max)
}

function host(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
