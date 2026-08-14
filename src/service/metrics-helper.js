import { FormMetricName, FormStatus } from '@defra/forms-model'
import { format } from 'date-fns'

export const CalculationTypes = {
  Accumulation: 'Accumulation',
  AccumulationWithDrilldown: 'AccumulationWithDrilldown',
  Snapshot: 'Snapshot',
  Average: 'Average'
}

export const metricConfig =
  /** { Record<FormMetricName, { calculationType: string }>} */ {
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
  }

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
  return (
    metric.metricName === FormMetricName.Submissions &&
    metric.formStatus === FormStatus.Draft
  )
}

/**
 * @param {FormTimelineMetric} metric
 */
export function isLiveSubmission(metric) {
  return (
    metric.metricName === FormMetricName.Submissions &&
    metric.formStatus === FormStatus.Live
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
  if (calculationType === CalculationTypes.AccumulationWithDrilldown) {
    updateMetricTotal(metric, period, saveDrilldown)
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
 * @import { FormTimelineMetric } from '@defra/forms-model'
 */
