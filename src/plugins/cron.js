import { getErrorMessage } from '@defra/forms-model'
import cron from 'node-cron'

import { config } from '~/src/config/index.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { runMetricsCollectionJob } from '~/src/service/metrics.js'

/**
 * Cron plugin for collecting metrics
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const cronPlugin = {
  plugin: {
    name: 'cron-metrics',
    version: '1.0.0',
    register(server) {
      const scheduledTask = cron.schedule(
        config.get('metricsCrontab'),
        async () => {
          try {
            logger.info('[Cron] Starting metrics collection')
            await runMetricsCollectionJob()
            logger.info('[Cron] Finished metrics collection')
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

      // Stop the cron job when the server stops
      server.ext('onPreStop', () => {
        logger.info('[Cron] Stopping metrics cron job')
        const stopResult = scheduledTask.stop()
        // Handle both Promise and void return types
        if (stopResult && typeof stopResult.then === 'function') {
          stopResult.catch(() => {
            // Ignore errors during shutdown
          })
        }
        logger.info('[Cron] Metrics cron job stopped')
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
