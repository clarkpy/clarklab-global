import { spawnSync } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export function resolveAgentSourceDir(): string {
  const candidates = [
    join(moduleDir, '../../clarklab-agent'),
    join(moduleDir, '../../../clarklab-agent'),
  ]

  for (const dir of candidates) {
    try {
      accessSync(join(dir, 'Cargo.toml'), constants.R_OK)
      accessSync(join(dir, 'src', 'main.rs'), constants.R_OK)
      return dir
    } catch {
      continue
    }
  }

  throw new Error('Agent source directory not found')
}

export function packAgentSourceArchive(): Buffer {
  const agentDir = resolveAgentSourceDir()
  const result = spawnSync('tar', ['-czf', '-', 'Cargo.toml', 'src'], {
    cwd: agentDir,
    encoding: 'buffer',
  })

  if (result.status !== 0 || !result.stdout?.length) {
    const detail = result.stderr?.toString().trim() || 'tar failed'
    throw new Error(detail)
  }

  return result.stdout
}

export function readAgentSourceFile(filename: string): string {
  if (!/^[a-z_]+\.rs$/.test(filename)) {
    throw new Error('Invalid agent source file')
  }

  const sourcePath = join(resolveAgentSourceDir(), 'src', filename)
  return readFileSync(sourcePath, 'utf8')
}