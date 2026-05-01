import {
  AuditEventMessageType,
  FormMetricName,
  FormStatus
} from '@defra/forms-model'
import {
  add,
  differenceInDays,
  format,
  startOfDay,
  sub,
  subDays,
  subYears
} from 'date-fns'

import { config } from '~/src/config/index.js'
import { getErrorMessage } from '~/src/helpers/error-message.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { getJson } from '~/src/lib/fetch.js'
import { client } from '~/src/mongo.js'
import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import {
  clearMetricsData,
  deleteFormOverviewMetrics,
  getAllOverviewMetrics,
  getAllTimelineMetrics,
  getFirstDraft,
  getMetricTotals,
  getNumberOfFormsInDraft,
  grabLock,
  isFirstPublish,
  releaseLock,
  saveFormOverviewMetrics,
  saveFormTimelineMetrics,
  updateMetricTotals
} from '~/src/repositories/metrics-repository.js'

const managerUrl = config.get('managerUrl')
const submissionUrl = config.get('submissionUrl')

const CalculationTypes = {
  Accumulation: 'Accumulation',
  Snapshot: 'Snapshot',
  Average: 'Average'
}

const metricConfig =
  /** { Record<FormMetricName, { calculationType: string }>} */ {
    [FormMetricName.NewFormsCreated]: {
      calculationType: CalculationTypes.Accumulation
    },
    [FormMetricName.FormsPublished]: {
      calculationType: CalculationTypes.Accumulation
    },
    [FormMetricName.Submissions]: {
      calculationType: CalculationTypes.Accumulation
    },
    [FormMetricName.FormsInDraft]: {
      calculationType: CalculationTypes.Snapshot
    },
    [FormMetricName.TimeToPublish]: {
      calculationType: CalculationTypes.Average
    }
  }

/**
 * @param {Date} date
 */
export function formatDateOnly(date) {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Collect metrics
 * @param {boolean} deleteDatabase
 */
export async function runMetricsCollectionJob(deleteDatabase = false) {
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
      if (deleteDatabase) {
        await clearMetricsData(session)
        lockResult.lastSuccessfulRun = null
      }
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
    await session.endSession()
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
  const yesterday = sub(jobStart, { days: 1 })
  let reportDate = lastSuccessfulRunDate ?? sub(jobStart, { days: 480 })

  while (formatDateOnly(reportDate) <= formatDateOnly(yesterday)) {
    logger.info(
      `[metrics] getting timeline metrics for ${reportDate.toISOString()}`
    )
    await collectTimelineMetrics(submissionUrl, reportDate, session)
    await collectTimelineMetricsFromAudit(reportDate, session)
    reportDate = add(reportDate, { days: 1 })
  }

  const totals = await recalcMetrics(yesterday, session)
  await updateMetricTotals(yesterday, totals, session)
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

  await deleteFormOverviewMetrics(session)

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
 * Collect timeline metrics from audit events
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
export async function collectTimelineMetricsFromAudit(reportingDate, session) {
  // Read 'forms in draft without a live form' so far from previous day
  let numOfFormsNotLive = await getNumberOfFormsInDraft(
    subDays(reportingDate, 1),
    session
  )

  // Draft created (for the first time)
  const firstCreatedCursor = getAuditRecordsOfType(
    AuditEventMessageType.FORM_CREATED,
    reportingDate,
    session
  )
  for await (const created of firstCreatedCursor) {
    const metric = /** @type {FormTimelineMetric} */ ({
      formStatus: FormStatus.Draft,
      metricName: FormMetricName.NewFormsCreated,
      metricValue: 1,
      createdAt: created.createdAt
    })
    await saveFormTimelineMetrics(created.entityId, metric, session)

    numOfFormsNotLive++
  }

  // Draft created (from live form)
  const createdFromLiveCursor = getAuditRecordsOfType(
    AuditEventMessageType.FORM_DRAFT_CREATED_FROM_LIVE,
    reportingDate,
    session
  )
  await saveBulkTimelineMetrics(
    createdFromLiveCursor,
    FormMetricName.NewFormsCreated,
    FormStatus.Draft,
    1,
    session
  )

  // Form published + time to publish
  const publishCursor = getAuditRecordsOfType(
    AuditEventMessageType.FORM_LIVE_CREATED_FROM_DRAFT,
    reportingDate,
    session
  )
  for await (const publish of publishCursor) {
    const metricPublish = /** @type {FormTimelineMetric} */ ({
      formStatus: FormStatus.Live,
      metricName: FormMetricName.FormsPublished,
      metricValue: 1,
      createdAt: publish.createdAt
    })
    await saveFormTimelineMetrics(publish.entityId, metricPublish, session)

    // Check if first publish
    const firstPublish = await isFirstPublish(publish.entityId, session)
    if (firstPublish) {
      // Time to first publish
      numOfFormsNotLive--
      const firstDraft = await getFirstDraft(publish.entityId, session)
      if (firstDraft) {
        const metricTimeToPublish = /** @type {FormTimelineMetric} */ ({
          formStatus: FormStatus.Live,
          metricName: FormMetricName.TimeToPublish,
          metricValue: differenceInDays(
            publish.createdAt,
            firstDraft.createdAt
          ),
          createdAt: publish.createdAt
        })
        await saveFormTimelineMetrics(
          publish.entityId,
          metricTimeToPublish,
          session
        )
      }
    }
  }

  const draftCount = /** @type {FormTimelineMetric} */ ({
    metricName: FormMetricName.FormsInDraft,
    metricValue: numOfFormsNotLive,
    formStatus: FormStatus.Draft,
    createdAt: reportingDate
  })
  await saveFormTimelineMetrics('n/a', draftCount, session)
}

/**
 * @param {FindCursor<WithId<AuditRecordInput>>} cursor
 * @param {FormMetricName} metricName
 * @param {FormStatus} formStatus
 * @param {number} metricValue
 * @param {ClientSession} session
 */
export async function saveBulkTimelineMetrics(
  cursor,
  metricName,
  formStatus,
  metricValue,
  session
) {
  for await (const created of cursor) {
    const metric = /** @type {FormTimelineMetric} */ ({
      formStatus,
      metricName,
      metricValue,
      createdAt: created.createdAt
    })
    await saveFormTimelineMetrics(created.entityId, metric, session)
  }
}

/**
 * @param {FormTimelineMetric} metric
 * @param { Record<string, { count?: number }> | undefined } period
 * @param {string} calculationType
 */
export function handleMetricValue(metric, period, calculationType) {
  if (calculationType === CalculationTypes.Accumulation) {
    updateMetricTotal(metric, period)
  }
  if (calculationType === CalculationTypes.Snapshot) {
    setMetricTotal(metric, period)
  }
  if (calculationType === CalculationTypes.Average) {
    updateMetricAverage(metric, period)
  }
}

/**
 * @param {FormTimelineMetric} metric
 * @param { Record<string, { count?: number }> | undefined } period
 */
export function updateMetricTotal(metric, period) {
  const metricName = metric.metricName
  if (
    !period ||
    (metric.metricName === FormMetricName.Submissions.toString() &&
      metric.formStatus !== FormStatus.Live)
  ) {
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
 * @param {FormTimelineMetric} metric
 * @param { Record<string, { count?: number }> | undefined } period
 */
export function setMetricTotal(metric, period) {
  if (!period) {
    return
  }
  const metricName = metric.metricName
  period[metricName] = { count: metric.metricValue }
}

/**
 * @param {FormTimelineMetric} metric
 * @param { Record<string, { count?: number, avgTotal?: number, avgCount?: number }> | undefined } period
 */
export function updateMetricAverage(metric, period) {
  const metricName = metric.metricName
  if (!period) {
    return
  }
  if (
    metricName in period &&
    'avgTotal' in period[metricName] &&
    'avgCount' in period[metricName]
  ) {
    const currentAvgTotal = period[metricName].avgTotal ?? 0
    const currentAvgCount = period[metricName].avgCount ?? 0
    period[metricName].avgTotal = currentAvgTotal + metric.metricValue
    period[metricName].avgCount = currentAvgCount + 1
  } else {
    period[metricName] = { avgTotal: metric.metricValue, avgCount: 1 }
  }
}

/**
 * @param {Date} date
 * @param {Date} startOfRange
 * @param {Date} endOfRange
 */
function dateFallsInsideTimeslot(date, startOfRange, endOfRange) {
  return date >= startOfRange && date < endOfRange
}

/**
 * @param {FormTimelineMetric} metric
 */
function isDraftSubmission(metric) {
  return (
    metric.metricName === FormMetricName.Submissions.toString() &&
    metric.formStatus === FormStatus.Draft
  )
}

/**
 * @param {FormTimelineMetric} metric
 */
function isLiveSubmission(metric) {
  return (
    metric.metricName === FormMetricName.Submissions.toString() &&
    metric.formStatus === FormStatus.Live
  )
}

/**
 * @param {FormTimelineMetric} metric
 */
function getMetricCalcType(metric) {
  const metricName = /** @type {FormMetricName} */ (metric.metricName)
  return metricConfig[metricName].calculationType
}

/**
 * Update metric totals by summing metrics within given windows
 * @param {Date} reportingDate
 * @param {ClientSession} session
 * @returns {Promise<FormTotalsMetric>}
 */
export async function recalcMetrics(reportingDate, session) {
  const reportMorning = startOfDay(reportingDate)
  const sevenDaysAgo = subDays(reportMorning, 7)
  const fourteenDaysAgo = subDays(reportMorning, 14)
  const thirtyDaysAgo = subDays(reportMorning, 30)
  const sixtyDaysAgo = subDays(reportMorning, 60)
  const oneYearAgo = subYears(reportMorning, 1)
  const twoYearsAgo = subYears(reportMorning, 2)

  const maps = {
    formSubmissionsMapDraft: /** @type {Map<string, number>} */ (new Map()),
    formSubmissionsMapLive: /** @type {Map<string, number>} */ (new Map()),
    formDaysToPublishMap: /** @type {Map<string, number>} */ (new Map()),
    formRepublishedMap: /** @type {Map<string, number>} */ (new Map())
  }

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
    const metricCalcType = getMetricCalcType(metric)
    if (metricCalcType === CalculationTypes.Accumulation) {
      // Live submissions
      handleLiveSubmissions(metric, maps.formSubmissionsMapLive)

      // Draft submissions
      handleDraftSubmissions(metric, maps.formSubmissionsMapDraft)
    }

    if (metric.metricName === FormMetricName.TimeToPublish.toString()) {
      maps.formDaysToPublishMap.set(metric.formId, metric.metricValue)
    }
    if (metric.metricName === FormMetricName.FormsPublished.toString()) {
      const formTotalSoFar = maps.formRepublishedMap.get(metric.formId) ?? 0
      maps.formRepublishedMap.set(
        metric.formId,
        formTotalSoFar + metric.metricValue
      )
    }

    // Update windowed metrics
    const createdAt = new Date(metric.createdAt)
    // Last 7 days
    handleTimeslot(
      metric,
      totals.last7Days,
      metricCalcType,
      createdAt,
      sevenDaysAgo,
      reportMorning
    )

    // Previous 7 days
    handleTimeslot(
      metric,
      totals.prev7Days,
      metricCalcType,
      createdAt,
      fourteenDaysAgo,
      sevenDaysAgo
    )

    // Last 30 days
    handleTimeslot(
      metric,
      totals.last30Days,
      metricCalcType,
      createdAt,
      thirtyDaysAgo,
      reportMorning
    )

    // Previous 30 days
    handleTimeslot(
      metric,
      totals.prev30Days,
      metricCalcType,
      createdAt,
      sixtyDaysAgo,
      thirtyDaysAgo
    )

    // Last year
    handleTimeslot(
      metric,
      totals.lastYear,
      metricCalcType,
      createdAt,
      oneYearAgo,
      reportMorning
    )

    // Previous year
    handleTimeslot(
      metric,
      totals.prevYear,
      metricCalcType,
      createdAt,
      twoYearsAgo,
      oneYearAgo
    )

    // All time
    handleMetricValue(metric, totals.allTime, metricCalcType)
  }
  totals.liveSubmissions = Object.fromEntries(maps.formSubmissionsMapLive)
  totals.draftSubmissions = Object.fromEntries(maps.formSubmissionsMapDraft)
  totals.daysToPublish = Object.fromEntries(maps.formDaysToPublishMap)
  totals.republished = Object.fromEntries(
    decrementCountsForRepublish(maps.formRepublishedMap)
  )
  const finalTotals = calcAverages(totals)
  return finalTotals
}

/**
 * @param {FormTimelineMetric} metric
 * @param {Map<string, number>} map
 */
function handleLiveSubmissions(metric, map) {
  if (isLiveSubmission(metric)) {
    const formTotalSoFar = map.get(metric.formId) ?? 0
    map.set(metric.formId, formTotalSoFar + metric.metricValue)
  }
}

/**
 * @param {FormTimelineMetric} metric
 * @param {Map<string, number>} map
 */
function handleDraftSubmissions(metric, map) {
  if (isDraftSubmission(metric)) {
    const formTotalSoFar = map.get(metric.formId) ?? 0
    map.set(metric.formId, formTotalSoFar + metric.metricValue)
  }
}

/**
 * @param {FormTimelineMetric} metric
 * @param {Record<string, { count?: number }> | undefined} period
 * @param {string} metricCalcType
 * @param {Date} createdAt
 * @param {Date} startOfSlot
 * @param {Date} endOfSlot
 */
function handleTimeslot(
  metric,
  period,
  metricCalcType,
  createdAt,
  startOfSlot,
  endOfSlot
) {
  if (dateFallsInsideTimeslot(createdAt, startOfSlot, endOfSlot)) {
    handleMetricValue(metric, period, metricCalcType)
  }
}

/**
 * @param {any} totals
 */
export function calcAverages(totals) {
  const totalsCopy = {
    ...totals
  }
  for (const periodName of Object.keys(totals)) {
    for (const metricName of Object.keys(totals[periodName])) {
      for (const metricPropertyName of Object.keys(
        totals[periodName][metricName]
      )) {
        if (metricPropertyName === 'avgTotal') {
          const total = totals[periodName][metricName].avgTotal
          const count = totals[periodName][metricName].avgCount
          totalsCopy[periodName][metricName].count = (total / count).toFixed(1)
          delete totalsCopy[periodName][metricName].avgTotal
          delete totalsCopy[periodName][metricName].avgCount
        }
      }
    }
  }
  return totalsCopy
}

/**
 * @param {Map<string, number>} map
 */
export function decrementCountsForRepublish(map) {
  const mapWithDecrementedValues = new Map()
  for (const [key, value] of map) {
    mapWithDecrementedValues.set(key, value - 1)
  }
  return mapWithDecrementedValues
}

/**
 * Generates a report based on the stored metrics
 */
export async function generateReport() {
  const session = client.startSession()

  try {
    // Overview
    const overview = await getAllOverviewMetrics(session).toArray()
    const totals = await getMetricTotals(session)
    return {
      overview,
      totals
    }
  } finally {
    await session.endSession()
  }
}

/**
 * @import { ClientSession, FindCursor, WithId } from 'mongodb'
 * @import { AuditRecordInput, FormMetricType, FormOverviewMetric, FormTimelineMetric, FormTotalsMetric } from '@defra/forms-model'
 */
