import { useCallback, useRef } from 'react'

/**
 * Handle de arrastre vertical entre dos paneles.
 * onResize(delta) se llama con el desplazamiento en px mientras se arrastra.
 */
export default function ResizeHandle({ onResize }) {
  const dragging = useRef(false)
  const startX   = useRef(0)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    startX.current   = e.clientX

    const onMouseMove = (e) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      startX.current = e.clientX
      onResize(delta)
    }

    const onMouseUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [onResize])

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 bg-gray-300 hover:bg-indigo-600 cursor-col-resize transition-colors active:bg-indigo-500 dark:bg-gray-800"
      title="Arrastra para redimensionar"
    />
  )
}
