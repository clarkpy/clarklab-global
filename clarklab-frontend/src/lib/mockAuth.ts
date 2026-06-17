const mockUsers: Array<{ username: string; password: string; email?: string }> = []

export const DEMO_ACCESS_CODE = 'demo-homelab'
export const DEMO_USERNAME = 'demo'
export const DEMO_PASSWORD = 'Demo123!'

export function getMockUsers() {
  return mockUsers
}

export function addMockUser(username: string, password: string, email = '') {
  mockUsers.push({ username, password, email })
}

export function findMockUser(username: string) {
  return mockUsers.find((u) => u.username.toLowerCase() === username.toLowerCase())
}

export function seedMockDemoAccount() {
  if (!findMockUser(DEMO_USERNAME)) {
    addMockUser(DEMO_USERNAME, DEMO_PASSWORD, 'demo@clarklab.local')
  }
}

seedMockDemoAccount()
