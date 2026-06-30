import { describe, expect, it } from 'vitest'
import { resolveContainerPort } from './databaseTemplates.js'

describe('resolveContainerPort', () => {
  it('uses template default for mongodb', () => {
    expect(resolveContainerPort({ templateId: 'mongodb' }, 2994)).toBe(27017)
  })

  it('prefers stored container port', () => {
    expect(resolveContainerPort({ templateId: 'mongodb', containerPort: 27017 }, 2994)).toBe(27017)
  })

  it('falls back to host port for git apps', () => {
    expect(resolveContainerPort({ templateId: 'git-repo', sourceType: 'git' }, 3000)).toBe(3000)
  })
})