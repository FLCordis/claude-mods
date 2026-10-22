// Uma paleta de terminal vira um tema do Claude Code (`~/.claude/themes/<slug>.json`). Puro.

import { blend, contrast, legible } from './palette'
import type { ThemeEntry } from './palette'

/** O arquivo de tema customizado: os tokens que faltam herdam do tema base. */
export type ClaudeTheme = { name: string; base: 'dark' | 'light'; overrides: Record<string, string> }

/**
 * Todos os tokens de cor do tema do Claude Code neste build (2.1.302). Um token de fora fica com a
 * cor do tema base, então o conversor cobre todos para o tema sair inteiro, sem manchas do padrão.
 */
export const THEME_TOKENS = [
  'autoAccept', 'autoAcceptShimmer', 'background', 'bashBorder', 'bashMessageBackgroundColor',
  'blue_FOR_SUBAGENTS_ONLY', 'briefLabelClaude', 'briefLabelYou', 'chromeYellow', 'claude',
  'claudeBlueShimmer_FOR_SYSTEM_SPINNER', 'claudeBlue_FOR_SYSTEM_SPINNER', 'claudeShimmer',
  'clawd_background', 'clawd_body', 'composerSidebarBackground', 'cyan_FOR_SUBAGENTS_ONLY',
  'diffAdded', 'diffAddedDimmed', 'diffAddedWord', 'diffRemoved', 'diffRemovedDimmed', 'diffRemovedWord',
  'effortUltra', 'error', 'fastMode', 'fastModeShimmer', 'green_FOR_SUBAGENTS_ONLY', 'ide', 'inactive',
  'inactiveShimmer', 'inverseText', 'memoryBackgroundColor', 'merged', 'orange_FOR_SUBAGENTS_ONLY',
  'permission', 'permissionShimmer', 'pink_FOR_SUBAGENTS_ONLY', 'planMode', 'professionalBlue',
  'promptBorder', 'promptBorderShimmer', 'purple_FOR_SUBAGENTS_ONLY', 'rainbow_blue', 'rainbow_blue_shimmer',
  'rainbow_green', 'rainbow_green_shimmer', 'rainbow_indigo', 'rainbow_indigo_shimmer', 'rainbow_orange',
  'rainbow_orange_shimmer', 'rainbow_red', 'rainbow_red_shimmer', 'rainbow_violet', 'rainbow_violet_shimmer',
  'rainbow_yellow', 'rainbow_yellow_shimmer', 'rate_limit_empty', 'rate_limit_fill', 'red_FOR_SUBAGENTS_ONLY',
  'remember', 'selectionBg', 'skill', 'subtle', 'success', 'suggestion', 'text', 'userMessageBackground',
  'userMessageBackgroundHover', 'warning', 'warningShimmer', 'yellow_FOR_SUBAGENTS_ONLY',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

/** O tema base puro (sem overrides): o "padrão escuro/claro" do menu, que também troca ao vivo. */
export function baseTheme(base: 'dark' | 'light'): ClaudeTheme {
  return { name: base === 'dark' ? 'menu: padrão escuro' : 'menu: padrão claro', base, overrides: {} }
}

/** A cor que mais se destaca do fundo entre as candidatas (texto apagado legível, acento visível). */
function readable(bg: string, candidates: readonly string[]): string {
  return [...candidates].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0]!
}

/**
 * Os papéis da paleta: o fundo e o texto do terminal, as seis matizes ANSI (com as brilhantes) e
 * um laranja para o acento do Claude, tirado do meio do vermelho com o amarelo do próprio tema.
 */
export function toClaudeTheme(entry: ThemeEntry): ClaudeTheme {
  const bg = entry.background
  const fg = entry.foreground
  const c = entry.colors
  // As matizes como texto: cada uma puxada para o texto do tema até ler no fundo (amarelo num
  // fundo claro, azul-escuro num fundo escuro). As misturas de fundo usam as cores cruas.
  const ink = (color: string) => legible(color, bg, fg, 3)
  const raw = { red: c[1]!, green: c[2]!, yellow: c[3]!, blue: c[4]!, magenta: c[5]!, cyan: c[6]! }
  const [red, green, yellow, blue, magenta, cyan] = [raw.red, raw.green, raw.yellow, raw.blue, raw.magenta, raw.cyan].map(ink) as [
    string, string, string, string, string, string,
  ]
  const [redHi, greenHi, yellowHi, blueHi, magentaHi, cyanHi] = [c[9]!, c[10]!, c[11]!, c[12]!, c[13]!, c[14]!].map(ink) as [
    string, string, string, string, string, string,
  ]
  const gray = c[8]!

  const orange = ink(blend(raw.red, raw.yellow, 0.45))
  const accent = readable(bg, [orange, ink(blend(c[9]!, c[11]!, 0.45))])
  const indigo = blend(blue, magenta, 0.5)
  // O brilho das animações: a mesma cor puxada um pouco para o texto do tema.
  const glow = (color: string) => blend(color, fg, 0.3)
  // Texto apagado: o cinza ANSI quando ele lê no fundo, senão o texto puxado para o fundo, sempre
  // com contraste para ser lido (apagado, como o do Claude Code, mas não sumido).
  const dim = legible(contrast(gray, bg) >= 2.5 ? gray : blend(bg, fg, 0.55), bg, fg, 2.5)
  const tint = (color: string, amount: number) => blend(bg, color, amount)

  const rainbow: Record<string, string> = { red, orange, yellow, green, blue: cyan, indigo, violet: magenta }

  const overrides: Record<ThemeToken, string> = {
    text: fg,
    inverseText: bg,
    subtle: dim,
    inactive: blend(bg, fg, 0.45),
    inactiveShimmer: glow(blend(bg, fg, 0.45)),
    claude: accent,
    claudeShimmer: glow(accent),
    claudeBlue_FOR_SYSTEM_SPINNER: blue,
    claudeBlueShimmer_FOR_SYSTEM_SPINNER: glow(blue),
    background: cyan,
    suggestion: blueHi,
    permission: blue,
    permissionShimmer: glow(blue),
    remember: magenta,
    skill: magentaHi,
    success: green,
    error: red,
    warning: yellow,
    warningShimmer: glow(yellow),
    merged: magenta,
    planMode: cyan,
    autoAccept: magentaHi,
    autoAcceptShimmer: glow(magentaHi),
    promptBorder: blend(bg, fg, 0.3),
    promptBorderShimmer: blend(bg, fg, 0.6),
    bashBorder: magentaHi,
    ide: blue,
    professionalBlue: blueHi,
    chromeYellow: yellowHi,
    fastMode: orange,
    fastModeShimmer: glow(orange),
    effortUltra: magentaHi,
    briefLabelYou: blueHi,
    briefLabelClaude: accent,
    clawd_body: accent,
    clawd_background: bg,
    rate_limit_fill: accent,
    rate_limit_empty: blend(bg, fg, 0.2),
    red_FOR_SUBAGENTS_ONLY: red,
    blue_FOR_SUBAGENTS_ONLY: blue,
    green_FOR_SUBAGENTS_ONLY: green,
    yellow_FOR_SUBAGENTS_ONLY: yellow,
    purple_FOR_SUBAGENTS_ONLY: magenta,
    orange_FOR_SUBAGENTS_ONLY: orange,
    pink_FOR_SUBAGENTS_ONLY: magentaHi,
    cyan_FOR_SUBAGENTS_ONLY: cyanHi,
    rainbow_red: rainbow.red!,
    rainbow_red_shimmer: glow(rainbow.red!),
    rainbow_orange: rainbow.orange!,
    rainbow_orange_shimmer: glow(rainbow.orange!),
    rainbow_yellow: rainbow.yellow!,
    rainbow_yellow_shimmer: glow(rainbow.yellow!),
    rainbow_green: rainbow.green!,
    rainbow_green_shimmer: glow(rainbow.green!),
    rainbow_blue: rainbow.blue!,
    rainbow_blue_shimmer: glow(rainbow.blue!),
    rainbow_indigo: rainbow.indigo!,
    rainbow_indigo_shimmer: glow(rainbow.indigo!),
    rainbow_violet: rainbow.violet!,
    rainbow_violet_shimmer: glow(rainbow.violet!),
    userMessageBackground: tint(fg, 0.1),
    userMessageBackgroundHover: tint(fg, 0.15),
    composerSidebarBackground: tint(fg, 0.05),
    bashMessageBackgroundColor: tint(raw.magenta, 0.1),
    memoryBackgroundColor: tint(raw.cyan, 0.1),
    selectionBg: tint(raw.blue, 0.4),
    diffAdded: tint(raw.green, 0.25),
    diffRemoved: tint(raw.red, 0.25),
    diffAddedDimmed: tint(raw.green, 0.12),
    diffRemovedDimmed: tint(raw.red, 0.12),
    diffAddedWord: tint(c[10]!, 0.5),
    diffRemovedWord: tint(c[9]!, 0.5),
  }

  return { name: `menu: ${entry.name}`, base: entry.variant, overrides }
}
