import { getErrorMessage } from '@defra/forms-model'
import cron from 'node-cron'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { runMetricsCollectionJob } from '~/src/service/metrics.js'

const logger = createLogger()
/**
 * Configure the regular job that collects metrics
 */
export function setupCron() {
  cron.schedule(
    config.get('metricsCrontab'),
    async () => {
      try {
        logger.info('[Cron] Starting metircs collection')
        await runMetricsCollectionJob()
        logger.info('[Cron] Finished metircs collection')
      } catch (err) {
        logger.error(
          err,
          `[Cron] Error running metrics collection - ${getErrorMessage(err)}`
        )
      }
    },
    {
      timezone: 'Europe/London'
    }
  )
}
