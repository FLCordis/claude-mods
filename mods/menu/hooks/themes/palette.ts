// Paletas de terminal e a aritmética de cor que o conversor usa. Puro, sem `$`.

/** Um tema do catálogo: as 16 cores ANSI (8 normais, 8 brilhantes), fundo, texto e cursor. */
export type ThemeEntry = {
  slug: string
  name: string
  variant: 'dark' | 'light'
  background: string
  foreground: string
  cursor: string
  /** As 16 cores na ordem ANSI: preto, vermelho, verde, amarelo, azul, magenta, ciano, branco; depois as brilhantes. */
  colors: string[]
  author?: string
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#abc`, `abc`, `#aabbcc` → `#aabbcc` minúsculo; null para o que não é uma cor hex. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = HEX.exec(value.trim())
  if (m === null) return null
  const digits = m[1]!.length === 3 ? [...m[1]!].map(c => c + c).join('') : m[1]!
  return `#${digits.toLowerCase()}`
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

/** A cor a `t` do caminho de `from` até `to` (0 é `from`, 1 é `to`). */
export function blend(from: string, to: string, t: number): string {
  const a = channels(from)
  const b = channels(to)
  return toHex(a.map((v, i) => v + (b[i]! - v) * t))
}

/** Luminância relativa (WCAG), de 0 (preto) a 1 (branco). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contraste WCAG entre duas cores: 1 (iguais) a 21 (preto e branco). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * `color` legível sobre `bg`: puxada aos poucos para `toward` (o texto do tema) até o contraste
 * chegar a `min`. Uma cor que já lê bem volta como veio; sem jeito de chegar, fica com `toward`.
 */
export function legible(color: string, bg: string, toward: string, min: number): string {
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const candidate = blend(color, toward, Math.min(1, t))
    if (contrast(candidate, bg) >= min) return candidate
  }
  return toward
}

/** Um fundo claro pede o tema base `light` do Claude Code. */
export const isLightBackground = (hex: string): boolean => luminance(hex) > 0.4

/** `Tokyo Night Storm` → `tokyo-night-storm`. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
