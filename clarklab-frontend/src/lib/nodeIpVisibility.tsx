import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type NodeIpVisibilityState = {
  revealed: boolean
  toggle: () => void
}

const NodeIpVisibilityContext = createContext<NodeIpVisibilityState | undefined>(undefined)

export function NodeIpVisibilityProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)

  const toggle = useCallback(() => {
    setRevealed((current) => !current)
  }, [])

  const value = useMemo(
    () => ({
      revealed,
      toggle,
    }),
    [revealed, toggle],
  )

  return (
    <NodeIpVisibilityContext.Provider value={value}>{children}</NodeIpVisibilityContext.Provider>
  )
}

export function useNodeIpVisibility() {
  const context = useContext(NodeIpVisibilityContext)
  if (!context) {
    throw new Error('useNodeIpVisibility must be used within NodeIpVisibilityProvider')
  }
  return context
}
