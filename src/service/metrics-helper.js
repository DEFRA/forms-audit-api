import {
  CopyAnswersMetricName,
  FormMetricName,
  FormStatus,
  FunctionalAreaType
} from '@defra/forms-model'
import { addDays, format, startOfDay, subDays, subYears } from 'date-fns'

import { FOURTEEN_DAYS, SEVEN_DAYS, THIRTY_DAYS } from '~/src/constants.js'
import { client } from '~/src/mongo.js'
import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import { saveFunctionalAreaTimelineMetrics } from '~/src/repositories/metrics-func-area-repository.js'
import { adjustEarliestDate } from '~/src/repositories/metrics-repository-helper.js'
import {
  getAllOverviewMetrics,
  getAllTimelineMetrics,
  getFunctionalAreaMetricTotals
} from '~/src/repositories/metrics-repository.js'
import { calcAverages } from '~/src/service/metrics.js'

export const CalculationTypes = {
  Accumulation: 'Accumulation',
  AccumulationWithDrilldown: 'AccumulationWithDrilldown',
  Snapshot: 'Snapshot',
  Average: 'Average'
}

export const metricConfig =
  /** @type { Record<FormMetricName, { calculationType: string }> } */ ({
    [FormMetricName.NewFormsCreated]: {
      calculationType: CalculationTypes.AccumulationWithDrilldown
    },
    [FormMetricName.FormsFirstPublished]: {
      calculationType: CalculationTypes.AccumulationWithDrilldown
    },
    [FormMetricName.FormsRePublished]: {
      calculationType: CalculationTypes.AccumulationWithDrilldown
    },
    [FormMetricName.Submissions]: {
      calculationType: CalculationTypes.AccumulationWithDrilldown
    },
    [FormMetricName.FormsInDraft]: {
      calculationType: CalculationTypes.Snapshot
    },
    [FormMetricName.TimeToPublish]: {
      calculationType: CalculationTypes.Average
    }
  })

export const metricDrilldownPeriods = ['last7Days', 'last30Days', 'allTime']

/**
 * @typedef {object} CollectionJobResult
 * @property {boolean} success - true if job was successful
 * @property {string} message - success message or error message
 * @property { Date | undefined } endDate - end date
 * @property {boolean} processMoreBatches - true if more batches need processing
 */

/**
 * @param {Date} date
 */
export function formatDateOnly(date) {
  return format(date, 'yyyy-MM-dd')
}

/**
 * @param {string} inDateStr
 * @param {Date} inTime
 */
export function setTimeOnDate(inDateStr, inTime) {
  return new Date(`${inDateStr}T${format(inTime, 'HH:mm:ss')}.000Z`)
}

/**
 * @param {Date} date
 * @param {Date} startOfRange
 * @param {Date} endOfRange
 */
export function dateFallsInsideTimeslot(date, startOfRange, endOfRange) {
  return date >= startOfRange && date < endOfRange
}

/**
 * @param {FormTimelineMetric} metric
 */
export function isDraftSubmission(metric) {
  return isSubmission(metric) && metric.formStatus === FormStatus.Draft
}

/**
 * @param {FormTimelineMetric} metric
 */
export function isLiveSubmission(metric) {
  return isSubmission(metric) && metric.formStatus === FormStatus.Live
}

/**
 * @param {FormTimelineMetric | FunctionalAreaTimelineMetric} metric
 */
function isSubmission(metric) {
  return (
    metric.metricName === FormMetricName.Submissions ||
    metric.metricName === CopyAnswersMetricName.CopyAnswersSubmission
  )
}

/**
 * @param {FormTimelineMetric} metric
 */
export function getMetricCalcType(metric) {
  const metricName = /** @type {FormMetricName} */ (metric.metricName)
  return metricConfig[metricName].calculationType
}

/**
 * @param {Record<string, number> | undefined} metricValues
 */
export function createFormMap(metricValues) {
  const formMap = new Map()
  for (const [formId, count] of Object.entries(metricValues ?? {})) {
    formMap.set(formId, count)
  }
  return formMap
}

/**
 * @param {FormTimelineMetric} metric
 * @param { Record<string, { count?: number }> | undefined } period
 * @param {string} calculationType
 * @param {boolean} [saveDrilldown]
 */
export function handleMetricValue(
  metric,
  period,
  calculationType,
  saveDrilldown
) {
  switch (calculationType) {
    case CalculationTypes.AccumulationWithDrilldown:
      updateMetricTotal(metric, period, saveDrilldown)
      break
    case CalculationTypes.Accumulation:
      updateMetricTotal(metric, period)
      break
    case CalculationTypes.Snapshot:
      setMetricTotal(metric, period)
      break
    case CalculationTypes.Average:
      updateMetricAverage(metric, period)
      break
  }
}

/**
 * @param {FormTimelineMetric} metric
 * @param {Record<string, { count?: number }> | undefined} period
 * @param {string} metricCalcType
 * @param {Date} createdAt
 * @param {Date} startOfSlot - inclusive
 * @param {Date} endOfSlot - exclusive
 * @param {boolean} [saveDrilldown]
 */
export function handleTimeslot(
  metric,
  period,
  metricCalcType,
  createdAt,
  startOfSlot,
  endOfSlot,
  saveDrilldown
) {
  if (dateFallsInsideTimeslot(createdAt, startOfSlot, endOfSlot)) {
    handleMetricValue(metric, period, metricCalcType, saveDrilldown)
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

  const existingMetric =
    metricName in period && 'count' in period[metricName]
      ? period[metricName]
      : undefined
  const details = drillDown
    ? [...(existingMetric?.details ?? []), mapToMinimal(metric)]
    : undefined

  period[metricName] = {
    count: (existingMetric?.count ?? 0) + metric.metricValue,
    ...(drillDown ? { details } : {})
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
    const metricAverage = period[metricName]
    metricAverage.avgTotal = (metricAverage.avgTotal ?? 0) + metric.metricValue
    metricAverage.avgCount = (metricAverage.avgCount ?? 0) + 1
  } else {
    period[metricName] = { avgTotal: metric.metricValue, avgCount: 1 }
  }
}

/**
 * @param {FormTimelineMetric} metric
 * @param {Map<string, number>} map
 */
export function handleLiveSubmissions(metric, map) {
  handleSubmission(metric, map, FormStatus.Live)
}

/**
 * @param {FormTimelineMetric} metric
 * @param {Map<string, number>} map
 */
export function handleDraftSubmissions(metric, map) {
  handleSubmission(metric, map, FormStatus.Draft)
}

/**
 * @param {FormTimelineMetric} metric
 * @param {Map<string, number>} map
 * @param {FormStatus} formStatus
 */
function handleSubmission(metric, map, formStatus) {
  if (metric.formStatus === formStatus && isSubmission(metric)) {
    map.set(metric.formId, (map.get(metric.formId) ?? 0) + metric.metricValue)
  }
}

/**
 * Constructs an object containing various period timeslots based on the reporting date.
 * @param {Date} reportingDate
 */
export function constructPeriodTimeslots(reportingDate) {
  const reportEnd = addDays(startOfDay(reportingDate), 1)

  return {
    reportEnd,
    sevenDaysAgo: subDays(reportEnd, SEVEN_DAYS),
    fourteenDaysAgo: subDays(reportEnd, FOURTEEN_DAYS),
    thirtyDaysAgo: subDays(reportEnd, THIRTY_DAYS),
    sixtyDaysAgo: subDays(reportEnd, 60),
    oneYearAgo: subYears(reportEnd, 1),
    twoYearsAgo: subYears(reportEnd, 2)
  }
}

/**
 * Collect signin metrics from audit events by type
 * @param {AuditEventMessageType} queryType
 * @param {string} metricName
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
export async function collectFunctionalAreaMetricsFromAuditByType(
  queryType,
  metricName,
  reportingDate,
  session
) {
  const cursor = getAuditRecordsOfType(
    queryType,
    reportingDate,
    undefined,
    session
  )
  for await (const created of cursor) {
    const metric = /** @type {FunctionalAreaTimelineMetric} */ ({
      metricName,
      metricValue: 1,
      createdAt: created.createdAt
    })
    await saveFunctionalAreaTimelineMetrics(metric, session)
  }
}

/**
 * Generates a report of functional area events
 * @param {Date} reportingDate
 * @param {FunctionalAreaType} area
 * @param {FunctionalAreaMetricName[]} allowedMetricNames
 * @param {ClientSession} session
 * @returns {Promise<FunctionalAreaTotalsMetric>}
 */
export async function recalcFunctionalAreaMetrics(
  reportingDate,
  area,
  allowedMetricNames,
  session
) {
  const timeslots = constructPeriodTimeslots(reportingDate)

  const formSubmissionsMapDraft = /** @type {Map<string, number>} */ (new Map())
  const formSubmissionsMapLive = /** @type {Map<string, number>} */ (new Map())

  const totals = /** @type {FunctionalAreaTotalsMetric} */ ({
    last7Days: {},
    prev7Days: {},
    last30Days: {},
    prev30Days: {},
    lastYear: {},
    prevYear: {},
    allTime: {},
    area
  })

  /** @type { Date | undefined } */
  let earliestDataDate

  const metricCursor = getAllTimelineMetrics(
    {
      metricName: { $in: allowedMetricNames }
    },
    session
  )

  for await (const metric of metricCursor) {
    const createdAt = new Date(metric.createdAt)
    // Find earliest metric
    earliestDataDate = adjustEarliestDate(earliestDataDate, createdAt)

    if (isSubmission(metric)) {
      // Live submissions
      handleLiveSubmissions(metric, formSubmissionsMapLive)

      // Draft submissions
      handleDraftSubmissions(metric, formSubmissionsMapDraft)

      // Only count live submissions for timeslot figures
      if (metric.formStatus === FormStatus.Live) {
        handleAllTimeslots(
          metric,
          totals,
          CalculationTypes.Accumulation,
          createdAt,
          timeslots
        )
      }
    } else {
      // Handle non-submission metrics for functional areas
      handleAllTimeslots(
        metric,
        totals,
        CalculationTypes.Accumulation,
        createdAt,
        timeslots
      )
    }
  }

  totals.liveSubmissions = Object.fromEntries(formSubmissionsMapLive)
  totals.draftSubmissions = Object.fromEntries(formSubmissionsMapDraft)
  // Approximate implementation date as fallback if no submissions found
  totals.earliestDate = earliestDataDate ?? new Date('2025-12-01')
  const finalTotals = calcAverages(totals)

  return finalTotals
}

/** @type {Record<FunctionalAreaType, string>} */
const FunctionalAreaFeatureMap = {
  [FunctionalAreaType.Signin]: 'no-metric-required',
  [FunctionalAreaType.CopyAnswers]: 'Copy answers'
}

/**
 * Generates a report based on the stored metrics for sign-in activities
 * @param {FunctionalAreaType} area - The functional area sub-type for which to generate the report
 */
export async function generateFunctionalAreaReport(area) {
  const session = client.startSession()

  const featureText = FunctionalAreaFeatureMap[area]

  try {
    // Get summary tiles
    const totals = await getFunctionalAreaMetricTotals(area, session)

    const overview = await getAllOverviewMetrics({}, session).toArray()

    const formsInFunctionalArea = overview.filter((form) =>
      Object.keys(form.featureMetrics.features).includes(featureText)
    )

    // Apply extra columns: submissionsCount
    const overviewFull = applySubmissionCountsForFunctionalArea({
      overview: formsInFunctionalArea,
      totals
    })

    return {
      totals,
      overview: overviewFull
    }
  } finally {
    await session.endSession()
  }
}

/**
 * @param {{ overview: FormOverviewMetric[], totals: FunctionalAreaTotalsMetric}} metrics
 */
export function applySubmissionCountsForFunctionalArea(metrics) {
  // Create a map of certain counts per form for quicker lookups
  const submissionCountsLive = createFormMap(metrics.totals.liveSubmissions)
  const submissionCountsDraft = createFormMap(metrics.totals.draftSubmissions)

  return metrics.overview.map((metric) => ({
    featureMetrics: metric.featureMetrics,
    summaryMetrics: metric.summaryMetrics,
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
 * Handles all timeslots for a given metric and totals, applying the appropriate calculations for each timeslot.
 * @param {WithId<FormTimelineMetric>} metric
 * @param {FormTotalsMetric | FunctionalAreaTotalsMetric} totals
 * @param {string} metricCalcType
 * @param {Date} createdAt
 * @param {Record<string, Date>} timeslots
 */
export function handleAllTimeslots(
  metric,
  totals,
  metricCalcType,
  createdAt,
  timeslots
) {
  /** @type {Array<[Record<string, { count?: number }> | undefined, Date, Date, boolean?]>} */
  const periods = [
    [totals.last7Days, timeslots.sevenDaysAgo, timeslots.reportEnd, true],
    [totals.prev7Days, timeslots.fourteenDaysAgo, timeslots.sevenDaysAgo],
    [totals.last30Days, timeslots.thirtyDaysAgo, timeslots.reportEnd, true],
    [totals.prev30Days, timeslots.sixtyDaysAgo, timeslots.thirtyDaysAgo],
    [totals.lastYear, timeslots.oneYearAgo, timeslots.reportEnd],
    [totals.prevYear, timeslots.twoYearsAgo, timeslots.oneYearAgo]
  ]

  for (const [period, start, end, saveDrilldown] of periods) {
    handleTimeslot(
      metric,
      period,
      metricCalcType,
      createdAt,
      start,
      end,
      saveDrilldown
    )
  }

  // All time
  handleMetricValue(metric, totals.allTime, metricCalcType, true)
}

/**
 * @import { ClientSession, WithId } from 'mongodb'
 * @import { AuditEventMessageType, FormOverviewMetric, FormTimelineMetric, FormTotalsMetric, FunctionalAreaMetricName, FunctionalAreaTimelineMetric, FunctionalAreaTotalsMetric } from '@defra/forms-model'
 */
