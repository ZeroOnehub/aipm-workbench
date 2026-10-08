import { globSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { UserConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

/**
 * vfile (Milkdown's Markdown pipeline) picks Node or browser helpers through
 * package `imports` (`#minpath`, `#minproc`, `#minurl`). The browser bundle
 * must take the browser files, so the three subpaths are pinned to them here.
 */
function vfileBrowserAliases(): Record<string, string> {
  const [lib] = globSync(resolve(import.meta.dirname, '../../../node_modules/.pnpm/vfile@*/node_modules/vfile/lib'))
  if (lib === undefined) throw new Error('aipm-workbench: vfile is not installed')
  return Object.fromEntries(['minpath', 'minproc', 'minurl'].map(name => [`#${name}`, join(lib, `${name}.browser.js`)]))
}

const base = clientBundle('@deepseek-ai/dsh-client-aipm-workbench', ['lib/types/index.js'])

export default ((input: Parameters<typeof base>[0]) => base(input).map((config: UserConfig) => {
  if (config.name !== '@deepseek-ai/dsh-client-aipm-workbench/client') return config
  const resolveOptions = config.inputOptions?.resolve ?? {}
  return {
    ...config,
    inputOptions: { ...config.inputOptions, resolve: { ...resolveOptions, alias: { ...resolveOptions.alias, ...vfileBrowserAliases() } } },
  }
})) as typeof base
