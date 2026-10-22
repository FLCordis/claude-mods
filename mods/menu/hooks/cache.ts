import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

const configRowsAtom = atom({ plugin: 'menu', key: 'configRows' } as const, [])
const commandsAtom = atom({ plugin: 'menu', key: 'commands' } as const, [])

/**
 * Relê as linhas do /config e os comandos da sessão para os átomos que as abas desenham. Roda ao
 * abrir o menu, ao trocar de aba e depois de cada ação: o desenho só lê átomos, então fica rápido
 * e a gravação redesenha quem leu. Uma leitura que falha deixa o valor anterior.
 */
export async function refreshCache($: EngineInterface): Promise<void> {
  const [rows, commands] = await Promise.all([
    $.config.list().catch(() => null),
    $.command.list().catch(() => null),
  ])
  if (rows !== null) await update($, configRowsAtom, () => [...rows])
  if (commands !== null) await update($, commandsAtom, () => commands.map(c => c.name))
}
