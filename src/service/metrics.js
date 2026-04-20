import { FormStatus } from '@defra/forms-model'
import { add, startOfDay, sub } from 'date-fns'

import { config } from '~/src/config/index.js'
import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { getJson } from '~/src/lib/fetch.js'
import { client } from '~/src/mongo.js'
import {
  grabLock,
  releaseLock,
  saveFormOverviewMetrics,
  saveFormTimelineMetrics
} from '~/src/repositories/metrics-repository.js'

const logger = createLogger()

const managerUrl = config.get('managerUrl')
const submissionUrl = config.get('submissionUrl')

/**
 * Collect metrics
 */
export async function runMetricsCollectionJob() {
  logger.info('[metrics] metrics job started')
  const result = {
    success: false,
    message: ''
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
      return
    }

    await session.withTransaction(async () => {
      await collectMetrics(jobStart, lockResult.lastSuccessfulRun, session)
      result.success = true
      result.message = 'Completed ok'
    })
  } catch (err) {
    const message = getErrorMessage(err)
    logger.error(err, `[metrics] metrics job failed - ${message}`)
    result.message = message
  } finally {
    await releaseLock(result.success, result.message, session)
  }

  logger.info('[metrics] metrics job finished')
}

/**
 * Collect a full set of metrics - both overview and snapshot
 * @param {Date} jobStart
 * @param { Date | null } lastSuccessfulRunDate
 * @param {ClientSession} session
 */
export async function collectMetrics(jobStart, lastSuccessfulRunDate, session) {
  logger.info('[metrics] getting overview metrics')
  await collectManagerOverviewMetrics(jobStart, session)

  // Make a call for each day since last job run
  // (Normally only one day but also handles full historical data population on first run)
  const yesterday = startOfDay(sub(jobStart, { days: 1 }))
  let reportDate = lastSuccessfulRunDate ?? new Date('2025-01-01T00:00:00.000Z')
  do {
    logger.info(
      `[metrics] getting timeline metrics for ${reportDate.toDateString()}`
    )
    await collectTimelineMetrics(managerUrl, reportDate, session)
    await collectTimelineMetrics(submissionUrl, reportDate, session)
    reportDate = add(reportDate, { days: 1 })
  } while (reportDate < yesterday)
}

/**
 * Collect overview metrics
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
export async function collectManagerOverviewMetrics(reportingDate, session) {
  const { body } = await getJson(
    new URL(
      `${managerUrl}/report/overview?date=${reportingDate.toISOString()}`
    ),
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
 * Collect timeline metrics
 * @param {string} baseUrl
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
export async function collectTimelineMetrics(baseUrl, reportingDate, session) {
  const { body } = await getJson(
    new URL(`${baseUrl}/report/timeline?date=${reportingDate.toISOString()}`),
    {}
  )
  const metricsArray = /** @type {{ timeline: FormTimelineMetric[] }} */ (body)

  for (const metric of metricsArray.timeline) {
    await saveFormTimelineMetrics(metric.formId, metric, session)
  }
}

/**
 * @import { ClientSession } from 'mongodb'
 * @import { FormOverviewMetric, FormTimelineMetric } from '@defra/forms-model'
 */
