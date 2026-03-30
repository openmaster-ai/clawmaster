import { useTranslation } from 'react-i18next'
import type { MemoryStats } from '@/shared/adapters/powermem'

interface Props {
  data?: MemoryStats | null
}

export default function MemoryStatsCard({ data }: Props) {
  const { t } = useTranslation()
  const agentCount = data?.by_agent ? Object.keys(data.by_agent).length : 0

  const typeLabels: Record<string, string> = {
    working: t('memory.typeWorking', 'Working'),
    short_term: t('memory.typeShortTerm', 'Short-term'),
    long_term: t('memory.typeLongTerm', 'Long-term'),
    unknown: t('memory.typeUnknown', 'Uncategorized'),
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">{t('memory.stats', 'Memory Stats')}</h3>
      {data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{t('memory.totalCount', 'Total')}</p>
              <p className="text-2xl font-bold">{data.total.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('memory.agentCount', 'Agents')}</p>
              <p className="text-2xl font-bold">{agentCount}</p>
            </div>
            {data.avg_retention !== undefined && (
              <div>
                <p className="text-muted-foreground">{t('memory.avgRetention', 'Avg Retention')}</p>
                <p className="text-2xl font-bold">{(data.avg_retention * 100).toFixed(0)}%</p>
              </div>
            )}
          </div>

          {data.by_type && Object.keys(data.by_type).length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('memory.typeDistribution', 'Type Distribution')}</p>
              <div className="flex gap-2">
                {Object.entries(data.by_type).map(([type, count]) => (
                  <span key={type} className={`text-xs px-2 py-1 rounded ${
                    type === 'long_term' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    type === 'short_term' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                    type === 'working' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                    'bg-muted'
                  }`}>
                    {typeLabels[type] ?? type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.by_agent && agentCount > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('memory.agentDistribution', 'Agent Distribution')}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.by_agent).map(([agent, count]) => (
                  <span key={agent} className="text-xs bg-muted px-2 py-1 rounded">
                    {agent}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.storage_type && (
            <p className="text-xs text-muted-foreground">{t('memory.storage', 'Storage')}: {data.storage_type}</p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('memory.noStats', 'No stats available')}</p>
      )}
    </div>
  )
}
