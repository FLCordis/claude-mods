// Formatação pura dos números do painel; sem `$`, testável isoladamente.
// Mesmas funções do terminal-hud, para os dois mods falarem a mesma língua.

/** `claude-opus-5-5[1m]` → `Opus 5.5 [1m]`; nomes fora do padrão passam como vieram. */
export function prettyModel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?(\[.*\])?$/i.exec(id.trim())
  if (!m) return id
  const [, family = '', major, minor, suffix] = m
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return `${name} ${major}${minor ? `.${minor}` : ''}${suffix ? ` ${suffix}` : ''}`
}

/** 1234 → `1.2k`, 1_000_000 → `1M`. */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (n >= 1_000) return `${trim(n / 1_000)}k`
  return String(n)
}

function trim(x: number): string {
  return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString()
}

/** Duração curta: `3d4h`, `2h13m`, `12m05s`, `45s`. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/** Barra em blocos: `████░░░░░░`, com a largura pedida em células. */
export function bar(percent: number, cells = 10): string {
  const full = Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))
  return '█'.repeat(full) + '░'.repeat(cells - full)
}

/** Cor por faixa de uso: verde, amarelo a partir de 70%, vermelho a partir de 90%. */
export function level(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'
  return 'success'
}

/** Último segmento de um caminho, Windows ou POSIX. */
export function basename(path: string): string {
  const parts = path.split(/[\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Corta no limite com reticência; largura em células aproximada por caracteres. */
export function clip(text: string, max: number): string {
  if (max <= 0) return ''
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, Math.max(0, max - 1)).join('')}…`
}

/** Janela de contexto por id de modelo: `[1m]` no nome é 1M, o resto 200k. */
export function windowFor(model: string): number {
  return /\[1m\]/i.test(model) ? 1_000_000 : 200_000
}
