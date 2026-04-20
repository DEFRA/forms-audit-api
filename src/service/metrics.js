import { FormStatus } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { getJson } from '~/src/lib/fetch.js'
import { client } from '~/src/mongo.js'
import {
  grabLock,
  releaseLock,
  saveFormOverviewMetrics
} from '~/src/repositories/metrics-repository.js'

const logger = createLogger()

const managerUrl = config.get('managerUrl')

/**
 * Collect metrics
 */
export async function runMetricsCollectionJob() {
  logger.info('metrics job started')
  const result = {
    success: false,
    message: ''
  }
  const session = client.startSession()
  try {
    await session.withTransaction(async () => {
      const jobStart = new Date()
      const lockSuccess = await grabLock(session)
      if (!lockSuccess) {
        logger.info(
          'metrics job aborting as another container already has a lock'
        )
        logger.info('metrics job finished')
        return
      }

      await collectMetrics(jobStart, session)

      result.success = true
      result.message = 'Completed ok'
    })
  } catch (err) {
    const message = getErrorMessage(err)
    logger.error(err, `metrics job failed - ${message}`)
    result.message = message
  } finally {
    await releaseLock(result.success, result.message, session)
  }

  logger.info('metrics job finished')
}

/**
 * Collect a full set of metrics - both overview and snapshot
 * @param {Date} jobStart
 * @param {ClientSession} session
 */
export async function collectMetrics(jobStart, session) {
  await collectOverviewMetrics(jobStart, session)
  // await collectSnapshotMetrics(jobStart, session)
}

/**
 * Collect overview metrics
 * @param {Date} jobStart
 * @param {ClientSession} session
 */
export async function collectOverviewMetrics(jobStart, session) {
  const { body } = await getJson(
    new URL(`${managerUrl}/report?date=${jobStart.toISOString()}`),
    {}
  )
  const metricsMap =
    /** @type {{ draft: Record<string, FormOverviewMetric>, live: Record<string, FormOverviewMetric>}} */ (
      body
    )

  for (const [formId, metrics] of Object.entries(metricsMap.draft)) {
    await saveFormOverviewMetrics(formId, FormStatus.Draft, metrics, session)
  }

  for (const [formId, metrics] of Object.entries(metricsMap.live)) {
    await saveFormOverviewMetrics(formId, FormStatus.Live, metrics, session)
  }
}

/**
 * @import { ClientSession } from 'mongodb'
 * @import { FormOverviewMetric } from '@defra/forms-model'
 */
