import cron from 'node-cron'

import { config } from '~/src/config/index.js'
import { runMetricsCollectionJob } from '~/src/service/metrics.js'

/**
 * Configure the regular job that collects metrics
 */
export function setupCron() {
  cron.schedule(
    config.get('metricsCrontab'),
    async () => {
      await runMetricsCollectionJob()
    },
    {
      timezone: 'Europe/London'
    }
  )
}
