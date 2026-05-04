import { Globe2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

interface Props {
  paneId: string
  tabs: string[]
  activeTab: string | null
  onActivate: (filename: string) => void
  onClose: (filename: string) => void
  onReorder: (draggedFilename: string, targetFilename: string) => void
}

function displayName(filename: string): string {
  return filename.replace(/\.a2ui\.json$/i, '').replace(/\.html$/i, '')
}

interface DragState {
  name: string
  startX: number
  startY: number
  currentX: number
  currentY: number
  isDragging: boolean
}

export function TabStrip({ tabs, activeTab, onActivate, onClose, onReorder }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressNextActivateRef = useRef<string | null>(null)

  useEffect(() => {
    if (!drag) return

    function tabAtPoint(clientX: number, clientY: number): string | null {
      const element = document.elementFromPoint?.(clientX, clientY)
      return element?.closest('[data-tab-name]')?.getAttribute('data-tab-name') ?? null
    }

    function handlePointerMove(event: PointerEvent) {
      setDrag((current) => {
        if (!current) return null
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
        const next = {
          ...current,
          currentX: event.clientX,
          currentY: event.clientY,
          isDragging: current.isDragging || distance > 3,
        }
        dragRef.current = next
        return next
      })
    }

    function handlePointerUp(event: PointerEvent) {
      const current = dragRef.current
      const target = tabAtPoint(event.clientX, event.clientY)
      if (current?.isDragging && target && target !== current.name) {
        suppressNextActivateRef.current = current.name
        onReorder(current.name, target)
      }
      dragRef.current = null
      setDrag(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [drag, onReorder])

  function beginDrag(event: ReactPointerEvent, name: string) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const next = {
      name,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      isDragging: false,
    }
    dragRef.current = next
    setDrag(next)
  }

  function activate(name: string) {
    if (suppressNextActivateRef.current === name) {
      suppressNextActivateRef.current = null
      return
    }
    onActivate(name)
  }

  return (
    <div className="tab-strip">
      <div className="tab-list">
        {tabs.map((name) => (
          <div
            key={name}
            className={`tab ${name === activeTab ? 'active' : ''} ${drag?.isDragging && drag.name === name ? 'dragging' : ''}`}
            data-tab-name={name}
            onPointerDown={(event) => beginDrag(event, name)}
            onClick={() => activate(name)}
          >
            <Globe2 size={14} />
            <span>{displayName(name)}</span>
            <button
              className="close"
              onClick={(e) => { e.stopPropagation(); onClose(name) }}
              aria-label={`Close ${name}`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {drag?.isDragging && createPortal(
        <div
          className="tab-drag-ghost"
          style={{ left: drag.currentX, top: drag.currentY }}
          aria-hidden="true"
        >
          <Globe2 size={14} />
          <span>{displayName(drag.name)}</span>
        </div>,
        document.body,
      )}
    </div>
  )
}
