import { FormStatus } from '@defra/forms-model'
import { add, startOfDay, sub, subDays, subYears } from 'date-fns'

import { config } from '~/src/config/index.js'
import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { getJson } from '~/src/lib/fetch.js'
import { client } from '~/src/mongo.js'
import {
  getAllOverviewMetrics,
  getAllTimelineMetrics,
  getMetricTotals,
  grabLock,
  releaseLock,
  saveFormOverviewMetrics,
  saveFormTimelineMetrics,
  updateMetricTotals
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

  const totals = await recalcMetricTotals(reportDate, session)
  await updateMetricTotals(reportDate, totals, session)
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
 * @param {FormTimelineMetric} metric
 * @param { Record<string, { count?: number }> | undefined } period
 */
export function updateMetricTotal(metric, period) {
  const metricName = metric.metricName
  if (!period) {
    return
  }
  if (metricName in period && 'count' in period[metricName]) {
    const currentTotal = period[metricName].count ?? 0
    period[metricName].count = currentTotal + metric.metricValue
  } else {
    period[metricName] = { count: metric.metricValue }
  }
}

/**
 * Update metric totals
 * @param {Date} reportingDate
 * @param {ClientSession} session
 * @returns {Promise<FormTotalsMetric>}
 */
export async function recalcMetricTotals(reportingDate, session) {
  const reportMorning = startOfDay(reportingDate)
  const sevenDaysAgo = subDays(reportMorning, 7)
  const fourteenDaysAgo = subDays(reportMorning, 14)
  const thirtyDaysAgo = subDays(reportMorning, 30)
  const sixtyDaysAgo = subDays(reportMorning, 60)
  const oneYearAgo = subYears(reportMorning, 1)
  const twoYearsAgo = subYears(reportMorning, 2)

  const formSubmissionsMap = /** @type {Map<string, number>} */ (new Map())
  const totals = /** @type {FormTotalsMetric} */ ({
    last7Days: {},
    prev7Days: {},
    last30Days: {},
    prev30Days: {},
    lastYear: {},
    prevYear: {},
    allTime: {}
  })
  for await (const metric of getAllTimelineMetrics(session)) {
    if (metric.metricName === 'Submissions') {
      const formTotalSoFar = formSubmissionsMap.get(metric.formId) ?? 0
      formSubmissionsMap.set(metric.formId, formTotalSoFar + metric.metricValue)
    }
    // Update windowed totals
    const createdAt = new Date(metric.createdAt)
    // Last 7 days
    if (createdAt >= sevenDaysAgo && createdAt < reportMorning) {
      updateMetricTotal(metric, totals.last7Days)
    }
    // Previous 7 days
    if (createdAt >= fourteenDaysAgo && createdAt < sevenDaysAgo) {
      updateMetricTotal(metric, totals.prev7Days)
    }
    // Last 30 days
    if (createdAt >= thirtyDaysAgo && createdAt < reportMorning) {
      updateMetricTotal(metric, totals.last30Days)
    }
    // Previous 30 days
    if (createdAt >= sixtyDaysAgo && createdAt < thirtyDaysAgo) {
      updateMetricTotal(metric, totals.prev30Days)
    }
    // Last year
    if (createdAt >= oneYearAgo && createdAt < reportMorning) {
      updateMetricTotal(metric, totals.lastYear)
    }
    // Previous year
    if (createdAt >= twoYearsAgo && createdAt < oneYearAgo) {
      updateMetricTotal(metric, totals.prevYear)
    }
    // All time
    updateMetricTotal(metric, totals.allTime)
  }
  totals.submissions = Object.fromEntries(formSubmissionsMap)
  return totals
}

/**
 * Generates a report based on the stored metrics
 */
export async function generateReport() {
  const session = client.startSession()

  // Overview
  const overview = await getAllOverviewMetrics(session).toArray()

  const totals = await getMetricTotals(session)

  return {
    overview,
    totals
  }
}

/**
 * @import { ClientSession } from 'mongodb'
 * @import { FormOverviewMetric, FormTimelineMetric, FormTotalsMetric } from '@defra/forms-model'
 */
