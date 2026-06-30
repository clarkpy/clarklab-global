import { access, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const frontendRoot = join(repoRoot, 'clarklab-frontend')
const viteCacheDir = join(frontendRoot, 'node_modules', '.vite')
const viteCacheMetadata = join(viteCacheDir, 'deps', '_metadata.json')

let viteRoot
try {
  viteRoot = dirname(require.resolve('vite/package.json'))
} catch {
  console.error(
    'Vite is not installed. From the repo root run:\n  npm install\n  npm run dev:stack',
  )
  process.exit(1)
}

const distChunk = join(viteRoot, 'dist/node/chunks/dist.js')

try {
  await access(distChunk)
} catch {
  console.error(
    `Vite install looks corrupted (missing ${distChunk}).\n` +
      'From the repo root run:\n' +
      '  npm run reinstall\n' +
      'or manually:\n' +
      '  rm -rf node_modules clarklab-frontend/node_modules clarklab-api/node_modules\n' +
      '  npm install',
  )
  process.exit(1)
}

async function newestMtime(paths) {
  let newest = 0
  for (const filePath of paths) {
    try {
      const info = await stat(filePath)
      if (info.mtimeMs > newest) newest = info.mtimeMs
    } catch {
      // missing file is fine
    }
  }
  return newest
}

async function shouldClearViteCache() {
  try {
    await access(viteCacheMetadata)
  } catch {
    return false
  }

  const cacheInfo = await stat(viteCacheMetadata)
  const cacheMtime = cacheInfo.mtimeMs

  const configMtime = await newestMtime([
    join(frontendRoot, 'vite.config.ts'),
    join(frontendRoot, 'package.json'),
    join(repoRoot, 'package-lock.json'),
  ])

  if (configMtime > cacheMtime) {
    return 'config or lockfile changed'
  }

  try {
    const metadata = JSON.parse(await readFile(viteCacheMetadata, 'utf8'))
    const reactDomSrc = metadata?.optimized?.['react-dom']?.src ?? ''
    if (reactDomSrc.includes('/clarklab-frontend/node_modules/react-dom')) {
      return 'react-dom path is stale for npm workspaces'
    }
  } catch {
    return 'unreadable optimize cache metadata'
  }

  return ''
}

const clearReason = await shouldClearViteCache()
if (clearReason) {
  await rm(viteCacheDir, { recursive: true, force: true })
  console.log(`Cleared Vite optimize cache (${clearReason}).`)
}
