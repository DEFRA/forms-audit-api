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
 * @import { FormTimelineMetric } from '@defra/forms-model'
 */
