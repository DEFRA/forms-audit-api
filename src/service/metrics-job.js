import { getErrorMessage } from '~/src/helpers/error-message.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { client } from '~/src/mongo.js'
import { grabLock, releaseLock } from '~/src/repositories/metrics-repository.js'
import { collectMetrics } from '~/src/service/metrics.js'

const MAX_DAYS_PER_BATCH = 30

/**
 * Collect metrics (this may involve multiple batches being collected)
 */
export async function runMetricsCollectionJob() {
  let continueProcessingBatches = true
  do {
    continueProcessingBatches = await runMetricsCollectionBatch()
  } while (continueProcessingBatches)
}

/**
 * Collect a batch of metrics
 * @returns {Promise<boolean>} continueBatches
 */
export async function runMetricsCollectionBatch() {
  logger.info('[metrics] metrics job started')

  let result = /* @type {CollectionJobResult} */ {
    success: false,
    processMoreBatches: false,
    message: '',
    endDate: /** @type { Date | undefined } */ (undefined)
  }

  const session = client.startSession()
  try {
    const jobStart = new Date()
    const lockResult = await grabLock(session)
    if (!lockResult.lockSuccess) {
      logger.info(
        '[metrics] metrics job aborting as another container already has a lock'
      )
      logger.info('[metrics] metrics job finished')
      return false
    }

    await session.withTransaction(async () => {
      result = await collectMetrics(
        jobStart,
        lockResult.lastSuccessfulRun,
        MAX_DAYS_PER_BATCH,
        session
      )
    })
  } catch (err) {
    const message = getErrorMessage(err)
    logger.error(err, `[metrics] metrics job failed - ${message}`)
    result.message = message
  } finally {
    await releaseLock(result, session)
    await session.endSession()
  }

  logger.info('[metrics] metrics job finished')
  return result.processMoreBatches
}
