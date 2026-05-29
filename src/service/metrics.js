import {
  AuditEventMessageType,
  FormMetricName,
  FormStatus
} from '@defra/forms-model'
import {
  add,
  differenceInDays,
  min,
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
  getFormTimelineMetricsCursor,
  getMetricTotals,
  getNumberOfFormsInDraft,
  grabLock,
  isFirstPublish,
  releaseLock,
  saveFormOverviewMetrics,
  saveFormTimelineMetrics,
  updateMetricTotals
} from '~/src/repositories/metrics-repository.js'
import {
  CalculationTypes,
  createFormMap,
  dateFallsInsideTimeslot,
  formatDateOnly,
  getMetricCalcType,
  isDraftSubmission,
  isLiveSubmission,
  setTimeOnDate
} from '~/src/service/metrics-helper.js'

/**
 * @typedef {object} FilterCriteria
 * @property {string} [searchText] - text to search within a form name
 * @property {string[]} [status] - array of statuses
 * @property {string[]} [org] - arrays of organisations
 */

const managerUrl = config.get('managerUrl')
const submissionUrl = config.get('submissionUrl')

const MAX_DAYS_PER_BATCH = 30
const EARLIEST_REPORT_DATE_AS_STRING = '2025-07-01'
const METRICS_FORM_BATCH_SIZE = 20

/**
 * Delete all metrics records from teh database (apart from the control record)
 */
export async function clearMetricsDatabase() {
  const session = client.startSession()
  try {
    await session.withTransaction(async () => {
      await clearMetricsData(session)
    })
  } finally {
    await session.endSession()
  }
}

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

/**
 * Collect a full set of metrics - both overview and snapshot
 * @param {Date} jobStart
 * @param { Date | null } lastSuccessfulRunDate
 * @param {number} daysPerBatch
 * @param {ClientSession} session
 * @returns {Promise<CollectionJobResult>}
 */
export async function collectMetrics(
  jobStart,
  lastSuccessfulRunDate,
  daysPerBatch,
  session
) {
  // Make a call for each day since last job run
  // (Normally only one day but also handles full historical data population on first run)
  // For full historical catch-up, it runs in batches until we reach 'yesterday' inclusive)
  const yesterday = sub(jobStart, { days: 1 })
  // Reporting start date = last-successful-run + 1, or a fixed time in the past just before events were being stored
  let reportDate = add(
    lastSuccessfulRunDate ??
      setTimeOnDate(EARLIEST_REPORT_DATE_AS_STRING, yesterday),
    { days: 1 }
  )
  const reportEndDate = min([
    add(reportDate, { days: daysPerBatch }),
    yesterday
  ])

  if (formatDateOnly(reportDate) > formatDateOnly(reportEndDate)) {
    return {
      success: false,
      message: 'Skipped',
      endDate: undefined,
      processMoreBatches: false
    }
  }

  logger.info('[metrics] getting overview metrics')
  await collectManagerOverviewMetrics(session)

  while (formatDateOnly(reportDate) <= formatDateOnly(reportEndDate)) {
    logger.info(
      `[metrics] getting timeline metrics for ${reportDate.toISOString()}`
    )
    await collectTimelineMetrics(submissionUrl, reportDate, session)
    await collectTimelineMetricsFromAudit(reportDate, session)
    reportDate = add(reportDate, { days: 1 })
  }

  const totals = await recalcMetrics(reportEndDate, session)
  await updateMetricTotals(reportEndDate, totals, session)
  return {
    success: true,
    message: 'Completed ok',
    processMoreBatches: formatDateOnly(reportDate) < formatDateOnly(yesterday),
    endDate: reportEndDate
  }
}

/**
 * Collect overview metrics
 * @param {ClientSession} session
 */
export async function collectManagerOverviewMetrics(session) {
  await deleteFormOverviewMetrics(session)

  // Batch up requests into small batches (say 20 forms at a time) to ensure the
  // API calls to forms-manager never take over 1 second to process (over 1 second response triggers an alert)
  let batchOfIds = []
  const formIds = await getAllFormIds()
  for (const id of formIds) {
    batchOfIds.push(id)
    if (batchOfIds.length >= METRICS_FORM_BATCH_SIZE) {
      await processMetricsBatch(batchOfIds, session)
      batchOfIds = []
    }
  }

  // Process the remainder that didn't make up a full batch
  if (batchOfIds.length) {
    await processMetricsBatch(batchOfIds, session)
  }
}

/**
 * @param {string[]} ids
 * @param {ClientSession} session
 */
async function processMetricsBatch(ids, session) {
  const metricsMap = await getOverviewMetricsForForms(ids)

  for (const [formId, metrics] of Object.entries(metricsMap.draft)) {
    await saveFormOverviewMetrics(formId, FormStatus.Draft, metrics, session)
  }

  for (const [formId, metrics] of Object.entries(metricsMap.live)) {
    await saveFormOverviewMetrics(formId, FormStatus.Live, metrics, session)
  }
}

/**
 * Get list of all form ids
 */
export async function getAllFormIds() {
  const { body } = /** @type {{ body: string[] }} */ (
    await getJson(new URL(`${managerUrl}/all-form-ids`), {})
  )
  return body
}

/**
 * @param {string[]} formIds
 */
export async function getOverviewMetricsForForms(formIds) {
  const requestUrl = new URL(`${managerUrl}/report/overview`)
  formIds.forEach((id) => {
    requestUrl.searchParams.append('ids', id)
  })

  const { body } = await getJson(requestUrl, {})

  return /** @type {{ draft: Record<string, FormOverviewMetric>, live: Record<string, FormOverviewMetric>}} */ (
    body
  )
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

  // Form published + time to publish
  const publishCursor = getAuditRecordsOfType(
    AuditEventMessageType.FORM_LIVE_CREATED_FROM_DRAFT,
    reportingDate,
    session,
    { createdAt: 1 } // Sort earliest first in case the first publish (and subsequent publised) occur on the same day
  )
  for await (const publish of publishCursor) {
    // Check if first publish
    const firstPublish = await isFirstPublish(publish.entityId, session)
    if (firstPublish) {
      // Time to first publish
      numOfFormsNotLive--

      const metricPublish = /** @type {FormTimelineMetric} */ ({
        formStatus: FormStatus.Live,
        metricName: FormMetricName.FormsFirstPublished,
        metricValue: 1,
        createdAt: publish.createdAt
      })
      await saveFormTimelineMetrics(publish.entityId, metricPublish, session)

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
    } else {
      const metricPublish = /** @type {FormTimelineMetric} */ ({
        formStatus: FormStatus.Live,
        metricName: FormMetricName.FormsRePublished,
        metricValue: 1,
        createdAt: publish.createdAt
      })
      await saveFormTimelineMetrics(publish.entityId, metricPublish, session)
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
  if (calculationType === CalculationTypes.AccumulationWithDrilldown) {
    updateMetricTotal(metric, period, true)
  }
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
 * @param { Record<string, { count?: number, details?: FormTimelineMetric[] }> | undefined } period
 * @param {boolean} [drillDown]
 */
export function updateMetricTotal(metric, period, drillDown) {
  const metricName = metric.metricName
  if (
    !period ||
    (metric.metricName === FormMetricName.Submissions &&
      metric.formStatus !== FormStatus.Live)
  ) {
    return
  }
  if (metricName in period && 'count' in period[metricName]) {
    const currentTotal = period[metricName].count ?? 0
    const newTotal = currentTotal + metric.metricValue
    const detail = drillDown
      ? {
          details: [...(period[metricName].details ?? []), mapToMinimal(metric)]
        }
      : {}
    period[metricName] = { count: newTotal, ...detail }
  } else {
    const detail = drillDown ? { details: [mapToMinimal(metric)] } : {}
    period[metricName] = { count: metric.metricValue, ...detail }
  }
}

/**
 * Remove unwanted properties (reduces the overall document size)
 * @param {FormTimelineMetric} detail
 */
function mapToMinimal(detail) {
  return /** @type {FormTimelineMetric} */ ({
    formId: detail.formId,
    metricValue: detail.metricValue,
    createdAt: detail.createdAt
  })
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
 * Update metric totals by summing metrics within given windows
 * @param {Date} reportingDate
 * @param {ClientSession} session
 * @param {string} [formId] - supplied if calcs are for a specific form
 * @returns {Promise<FormTotalsMetric>}
 */
export async function recalcMetrics(reportingDate, session, formId) {
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

  let earliestDataDate = new Date('2100-01-01')

  const metricCursor = formId
    ? getFormTimelineMetricsCursor(formId, session)
    : getAllTimelineMetrics(session)

  for await (const metric of metricCursor) {
    const metricCalcType = getMetricCalcType(metric)
    if (metric.metricName === FormMetricName.Submissions) {
      // Live submissions
      handleLiveSubmissions(metric, maps.formSubmissionsMapLive)

      // Draft submissions
      handleDraftSubmissions(metric, maps.formSubmissionsMapDraft)

      // Find earliest submission
      const createdAtSubmission = new Date(metric.createdAt)
      if (createdAtSubmission < earliestDataDate) {
        earliestDataDate = createdAtSubmission
      }
    }

    if (metric.metricName === FormMetricName.TimeToPublish) {
      maps.formDaysToPublishMap.set(metric.formId, metric.metricValue)
    }
    if (metric.metricName === FormMetricName.FormsRePublished) {
      const formTotalSoFar = maps.formRepublishedMap.get(metric.formId) ?? 0
      maps.formRepublishedMap.set(
        metric.formId,
        formTotalSoFar + metric.metricValue
      )
    }

    // Update windowed metrics
    const createdAt = new Date(metric.createdAt)
    // Last 7 days
    // prettier-ignore
    handleTimeslot(metric, totals.last7Days, metricCalcType, createdAt, sevenDaysAgo, reportMorning)

    // Previous 7 days
    // prettier-ignore
    handleTimeslot(metric, totals.prev7Days, metricCalcType, createdAt, fourteenDaysAgo, sevenDaysAgo)

    // Last 30 days
    // prettier-ignore
    handleTimeslot(metric, totals.last30Days, metricCalcType, createdAt, thirtyDaysAgo, reportMorning)

    // Previous 30 days
    // prettier-ignore
    handleTimeslot(metric, totals.prev30Days, metricCalcType, createdAt, sixtyDaysAgo, thirtyDaysAgo)

    // Last year
    // prettier-ignore
    handleTimeslot(metric, totals.lastYear, metricCalcType, createdAt, oneYearAgo, reportMorning)

    // Previous year
    // prettier-ignore
    handleTimeslot(metric, totals.prevYear, metricCalcType, createdAt, twoYearsAgo, oneYearAgo)

    // All time
    handleMetricValue(metric, totals.allTime, metricCalcType)
  }
  totals.liveSubmissions = Object.fromEntries(maps.formSubmissionsMapLive)
  totals.draftSubmissions = Object.fromEntries(maps.formSubmissionsMapDraft)
  totals.daysToPublish = Object.fromEntries(maps.formDaysToPublishMap)
  totals.republished = Object.fromEntries(maps.formRepublishedMap)
  totals.earliestDate = earliestDataDate
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
 * @param {string} metricPropertyName
 * @param {any} totals
 * @param {string} periodName
 * @param {string} metricName
 * @param {any} totalsCopy
 */
function calcAverage(
  metricPropertyName,
  totals,
  periodName,
  metricName,
  totalsCopy
) {
  if (metricPropertyName === 'avgTotal') {
    const total = totals[periodName][metricName].avgTotal
    const count = totals[periodName][metricName].avgCount
    totalsCopy[periodName][metricName].count = total / count
    delete totalsCopy[periodName][metricName].avgTotal
    delete totalsCopy[periodName][metricName].avgCount
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
        calcAverage(
          metricPropertyName,
          totals,
          periodName,
          metricName,
          totalsCopy
        )
      }
    }
  }
  return totalsCopy
}

/**
 * Generates a report based on the stored metrics
 * @param {FilterCriteria} filter
 */
export async function generateReport(filter) {
  const session = client.startSession()

  try {
    // Get metrics per form
    const overview = await getAllOverviewMetrics(filter, session).toArray()

    // Get summary tiles
    const totals = await getMetricTotals(session)
    // Apply extra columns: submssionsCount, re-published, daysToPublish
    const overviewFull = applyExtraColumns({ overview, totals })

    return {
      overview: overviewFull,
      totals
    }
  } finally {
    await session.endSession()
  }
}

/**
 * Generates a report for a single form, based on the stored metrics
 * @param {string} formId
 */
export async function generateReportForForm(formId) {
  const session = client.startSession()

  try {
    const yesterday = sub(new Date(), { days: 1 })

    const totals = await recalcMetrics(yesterday, session, formId)

    const { earliestDate, updatedAt } = await getMetricTotals(session)
    totals.earliestDate = earliestDate
    totals.updatedAt = updatedAt

    return {
      totals
    }
  } finally {
    await session.endSession()
  }
}

/**
 * @param {{ overview: FormOverviewMetric[], totals: FormTotalsMetric}} metrics
 */
export function applyExtraColumns(metrics) {
  // Create a map of certain counts per form for quicker lookups
  const submissionCountsLive = createFormMap(metrics.totals.liveSubmissions)
  const submissionCountsDraft = createFormMap(metrics.totals.draftSubmissions)
  const formDaysToPublish = createFormMap(metrics.totals.daysToPublish)
  const formRepublished = createFormMap(metrics.totals.republished)

  return metrics.overview.map((metric) => ({
    featureMetrics: metric.featureMetrics,
    summaryMetrics: {
      ...metric.summaryMetrics,
      daysToPublish:
        metric.formStatus === FormStatus.Live
          ? (formDaysToPublish.get(metric.formId) ?? 0)
          : undefined,
      republished:
        metric.formStatus === FormStatus.Live
          ? (formRepublished.get(metric.formId) ?? 0)
          : undefined
    },
    formId: metric.formId,
    formName: metric.summaryMetrics.name,
    formStatus: metric.formStatus,
    submissionsCount:
      (metric.formStatus === FormStatus.Live
        ? submissionCountsLive.get(metric.formId)
        : submissionCountsDraft.get(metric.formId)) ?? 0
  }))
}

/**
 * @import { ClientSession, FindCursor, WithId } from 'mongodb'
 * @import { AuditRecordInput, FormOverviewMetric, FormTimelineMetric, FormTotalsMetric } from '@defra/forms-model'
 * @import { CollectionJobResult } from '~/src/service/metrics-helper.js'
 */
