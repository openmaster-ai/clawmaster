import { useTranslation } from 'react-i18next'

interface LoadingStateProps {
  message?: string
}

export default function LoadingState({ message }: LoadingStateProps) {
  const { t } = useTranslation()
  const text = message ?? t('common.loading')
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm">{text}</p>
    </div>
  )
}
