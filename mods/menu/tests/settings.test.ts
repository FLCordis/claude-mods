import { expect, test } from 'claude-code/testing'

import { modeLabel, withDefaultMode } from '../hooks/settings'

test('withDefaultMode preserva as outras chaves e cria permissions', () => {
  const out = withDefaultMode('{"model":"fable","permissions":{"allow":["Bash"]}}', 'plan')
  expect(JSON.parse(out)).toEqual({ model: 'fable', permissions: { allow: ['Bash'], defaultMode: 'plan' } })
  expect(out.endsWith('\n')).toBe(true)
  expect(JSON.parse(withDefaultMode('', 'auto'))).toEqual({ permissions: { defaultMode: 'auto' } })
  expect(JSON.parse(withDefaultMode('  \n', 'auto'))).toEqual({ permissions: { defaultMode: 'auto' } })
})

test('withDefaultMode: ask apaga a chave e permissions vazio some', () => {
  expect(JSON.parse(withDefaultMode('{"permissions":{"defaultMode":"plan"}}', 'default'))).toEqual({})
  expect(JSON.parse(withDefaultMode('{"permissions":{"defaultMode":"plan","allow":["Bash"]}}', 'default'))).toEqual({
    permissions: { allow: ['Bash'] },
  })
})

test('withDefaultMode recusa JSON inválido sem gravar', () => {
  expect(() => withDefaultMode('{oops', 'plan')).toThrow(/settings\.json inválido/)
  expect(() => withDefaultMode('[1,2]', 'plan')).toThrow(/settings\.json inválido/)
})

test('modeLabel traduz os modos e devolve o id dos desconhecidos', () => {
  expect(modeLabel('default')).toBe('ask')
  expect(modeLabel('acceptEdits')).toBe('accept edits')
  expect(modeLabel('bypassPermissions')).toBe('bypass permissions')
  expect(modeLabel('whatever')).toBe('whatever')
  expect(modeLabel(null)).toBe('—')
})
