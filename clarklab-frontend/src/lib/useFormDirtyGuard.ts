import { useCallback, useRef } from 'react'

export function useFormDirtyGuard() {
  const dirtyRef = useRef(false)

  const markFormDirty = useCallback(() => {
    dirtyRef.current = true
  }, [])

  const resetFormDirty = useCallback(() => {
    dirtyRef.current = false
  }, [])

  const isFormDirty = useCallback(() => dirtyRef.current, [])

  const formEditCaptureProps = {
    onChangeCapture: markFormDirty,
    onInputCapture: markFormDirty,
  } as const

  return {
    dirtyRef,
    markFormDirty,
    resetFormDirty,
    isFormDirty,
    formEditCaptureProps,
  }
}
