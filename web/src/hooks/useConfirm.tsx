import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../components/shared/ui'

interface ConfirmOptions {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// App-wide replacement for window.confirm — same call-site shape (await, resolves to
// true/false) but renders as a styled modal instead of the browser's native dialog.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    const normalized = typeof options === 'string' ? { description: options } : options
    return new Promise<boolean>((resolve) => {
      setState({ options: normalized, resolve })
    })
  }, [])

  const close = (result: boolean) => {
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-backdrop-in" onClick={() => close(false)}>
          <div className="animate-flip-in w-full max-w-sm bg-white rounded-lg shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${state.options.danger ? 'bg-red-100 text-red-600' : 'bg-brand/10 text-brand'}`}>
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0">
                {state.options.title && <p className="font-medium text-slate-900">{state.options.title}</p>}
                <p className="text-sm text-slate-600 mt-0.5">{state.options.description}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" onClick={() => close(false)}>
                {state.options.cancelLabel ?? 'Cancel'}
              </Button>
              <Button variant={state.options.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {state.options.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
