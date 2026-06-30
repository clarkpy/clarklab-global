import { spawnSync } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const INSTALL_HELPER_SCRIPTS = new Set([
  'ensure-system-rust.sh',
  'clarklab-install-agent-binary.sh',
])

export function resolveScriptsDir(): string {
  const candidates = [
    join(moduleDir, '../../../scripts'),
    join(moduleDir, '../../scripts'),
  ]

  for (const dir of candidates) {
    try {
      accessSync(join(dir, 'install.sh'), constants.R_OK)
      return dir
    } catch {
      continue
    }
  }

  throw new Error('Scripts directory not found')
}

export function readInstallHelperScript(filename: string): string {
  if (!INSTALL_HELPER_SCRIPTS.has(filename)) {
    throw new Error('Not found')
  }

  const scriptPath = join(resolveScriptsDir(), filename)
  accessSync(scriptPath, constants.R_OK)
  return readFileSync(scriptPath, 'utf8')
}

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