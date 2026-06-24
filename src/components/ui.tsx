// 可复用 UI 组件
import { type ReactNode, useEffect } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============ Modal ============
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full glass rounded-2xl shadow-2xl animate-slide-up', width)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ============ Button ============
export function Button({
  children,
  variant = 'default',
  size = 'md',
  className,
  ...props
}: {
  children: ReactNode
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    default: 'bg-ink-700 hover:bg-ink-600 text-zinc-200 border border-white/5',
    primary:
      'bg-gradient-to-r from-accent to-accent-dark hover:from-accent-light hover:to-accent text-white shadow-lg shadow-accent/20',
    danger: 'bg-red-600/90 hover:bg-red-600 text-white',
    success: 'bg-emerald-600/90 hover:bg-emerald-600 text-white',
    ghost: 'hover:bg-white/5 text-zinc-400 hover:text-white',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ============ Input ============
export function Input({
  label,
  className,
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-zinc-400">{label}</label>}
      <input
        className={cn(
          'w-full rounded-xl bg-ink-850 border border-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600',
          'focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 transition-all',
          className,
        )}
        {...props}
      />
    </div>
  )
}

// ============ Select ============
export function Select({
  label,
  className,
  children,
  ...props
}: { label?: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-zinc-400">{label}</label>}
      <select
        className={cn(
          'w-full rounded-xl bg-ink-850 border border-white/5 px-3.5 py-2.5 text-sm text-white',
          'focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 transition-all',
          'appearance-none cursor-pointer',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

// ============ Textarea ============
export function Textarea({
  label,
  className,
  ...props
}: { label?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-zinc-400">{label}</label>}
      <textarea
        className={cn(
          'w-full rounded-xl bg-ink-850 border border-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 resize-none',
          'focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 transition-all',
          className,
        )}
        {...props}
      />
    </div>
  )
}

// ============ Badge ============
export function Badge({
  children,
  color = 'default',
}: {
  children: ReactNode
  color?: 'default' | 'indigo' | 'green' | 'red' | 'amber' | 'blue'
}) {
  const colors = {
    default: 'bg-white/5 text-zinc-400 border-white/10',
    indigo: 'bg-accent/10 text-accent-light border-accent/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium border',
        colors[color],
      )}
    >
      {children}
    </span>
  )
}

// ============ Page Header ============
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-white/5">
      <div>
        <h1 className="font-display text-xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ============ Empty State ============
export function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon: LucideIcon
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-800 border border-white/5 mb-4">
        <Icon size={28} className="text-zinc-600" />
      </div>
      <h3 className="font-display text-base font-semibold text-zinc-300">{title}</h3>
      {desc && <p className="text-xs text-zinc-600 mt-1 max-w-xs">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
