import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MAX_QTY } from '../lib/bag'

interface Props {
  qty: number
  name: string
  onChange: (qty: number) => void
  /** Called for the + button instead of onChange, e.g. to play the fly-to-bag animation. */
  onIncrement?: () => void
  size?: 'regular' | 'small'
}

/** − [ 3 ] + with a number you can type into directly. */
export function QtyStepper({ qty, name, onChange, onIncrement, size = 'regular' }: Props) {
  const [text, setText] = useState(String(qty))
  const [editing, setEditing] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!editing) setText(String(qty))
  }, [qty, editing])

  const commit = () => {
    setEditing(false)
    if (cancelled.current || text.trim() === '') {
      cancelled.current = false
      setText(String(qty))
      return
    }
    const n = Math.min(MAX_QTY, Math.max(0, parseInt(text, 10) || 0))
    onChange(n)
    setText(String(n))
  }

  return (
    <div className={`stepper ${size === 'small' ? 'stepper-small' : ''}`}>
      <button type="button" onClick={() => onChange(qty - 1)} aria-label={`One fewer ${name}`}>
        <Minus size={size === 'small' ? 13 : 15} strokeWidth={2.4} />
      </button>
      <input
        className="stepper-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        value={text}
        style={{ width: `${Math.max(2, text.length) + 0.6}ch` }}
        aria-label={`How many ${name}`}
        onFocus={(e) => {
          setEditing(true)
          e.target.select()
        }}
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      <button type="button" onClick={() => (onIncrement ? onIncrement() : onChange(qty + 1))} aria-label={`One more ${name}`}>
        <Plus size={size === 'small' ? 13 : 15} strokeWidth={2.4} />
      </button>
    </div>
  )
}
