// JSON com comentários e vírgula sobrando, como o settings.json do Windows Terminal. Puro.

/**
 * Percorre o texto fora das strings: `visit` recebe cada caractere (e o índice) e devolve o que
 * entra no resultado e quantos caracteres avançar. Dentro de uma string tudo passa como está.
 */
function scan(text: string, visit: (ch: string, i: number) => [string, number]): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; ) {
    const ch = text[i]!
    if (inString) {
      if (ch === '\\') {
        out += ch + (text[i + 1] ?? '')
        i += 2
        continue
      }
      if (ch === '"') inString = false
      out += ch
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }
    const [emit, step] = visit(ch, i)
    out += emit
    i += step
  }
  return out
}

/** O texto sem comentários `//` e `/* *\/` e sem vírgula antes de `}` ou `]`, strings intactas. */
export function stripJsonc(text: string): string {
  const noComments = scan(text, (ch, i) => {
    if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i)
      return ['\n', (end < 0 ? text.length : end + 1) - i]
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      return [' ', (end < 0 ? text.length : end + 2) - i]
    }
    return [ch, 1]
  })
  const closes = /\s*[}\]]/y
  return scan(noComments, (ch, i) => {
    if (ch !== ',') return [ch, 1]
    closes.lastIndex = i + 1
    return [closes.test(noComments) ? '' : ch, 1]
  })
}

/** O JSONC lido como valor; inválido lança com a razão do `JSON.parse`. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text))
}
