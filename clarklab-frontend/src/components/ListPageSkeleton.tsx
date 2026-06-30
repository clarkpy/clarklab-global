import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface ListPageSkeletonProps {
  statCount?: number
  rowCount?: number
}

export function ListPageSkeleton({ statCount = 3, rowCount = 5 }: ListPageSkeletonProps) {
  return (
    <div className="space-y-8">
      <div className={`grid gap-4 sm:grid-cols-${statCount}`} style={{ gridTemplateColumns: `repeat(${statCount}, minmax(0, 1fr))` }}>
        {Array.from({ length: statCount }).map((_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-8 w-12" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4">
        {Array.from({ length: rowCount }).map((_, index) => (
          <Card key={index} className="p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-3xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
