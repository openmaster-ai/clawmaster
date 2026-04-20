import { cn } from '@/lib/utils'

interface BrandMarkProps {
  animated?: boolean
  alt?: string
  className?: string
  imageClassName?: string
}

export function BrandMark({
  animated = false,
  alt = '',
  className,
  imageClassName,
}: BrandMarkProps) {
  return (
    <div className={className} aria-hidden={alt ? undefined : true}>
      <img
        src={animated ? '/logo-animated.svg' : '/logo.svg'}
        alt={alt}
        className={cn('h-full w-full', imageClassName)}
        decoding="async"
      />
    </div>
  )
}
