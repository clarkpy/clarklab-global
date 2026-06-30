import { Search } from 'lucide-react'
import { pageSearchInputClass } from '@/lib/pageInputClasses'

interface PageSearchInputProps {
  id: string
  label: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
}

export function PageSearchInput({
  id,
  label,
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: PageSearchInputProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Search
          className="theme-muted pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          id={id}
          type="search"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`${pageSearchInputClass} pl-11`}
        />
      </div>
    </div>
  )
}
