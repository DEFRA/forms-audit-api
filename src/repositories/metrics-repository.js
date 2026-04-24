import { FormMetricType, FormStatus } from '@defra/forms-model'

import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { METRICS_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

const FORM_METRIC_CONTROL = 'form-metric-control'

/**
 * @typedef {object} FormMetricControl
 * @property {string} type - type of record
 * @property {boolean} locked - true if locked i.e. a container is already running the job
 * @property {Date} jobStart - timestamp for when the job started
 * @property { Date | null } jobEnd - timestamp for when the job ended
 * @property { Date | null } lastSuccessfulRunDate - timestamp for when the last successful run started
 * @property {string} lastRunResult - outcome of last run
 * @property {Date} updatedAt - last updated timestamp
 */

/**
 * Gets the metric collection
 * @returns {Collection<FormOverviewMetric | FormTimelineMetric | FormTotalsMetric | FormMetricControl>}
 */
function getMetricCollection() {
  return /** @type {Collection<FormOverviewMetric | FormTimelineMetric | FormTotalsMetric | FormMetricControl>} */ (
    db.collection(METRICS_COLLECTION_NAME)
  )
}

/**
 * Gets overview metric records for a form.
 * @param {string} formId
 * @param {ClientSession} session
 * @returns {Promise<{ live: FormOverviewMetric | null, draft: FormOverviewMetric | null }>}
 */
export async function getFormOverviewMetrics(formId, session) {
  const coll = getMetricCollection()

  try {
    const draft = /** @type { WithId<FormOverviewMetric> | null } */ (
      await coll.findOne(
        {
          type: FormMetricType.OverviewMetric,
          formId,
          formStatus: FormStatus.Draft
        },
        { session }
      )
    )

    const live = /** @type { WithId<FormOverviewMetric> | null } */ (
      await coll.findOne(
        {
          type: FormMetricType.OverviewMetric,
          formId,
          formStatus: FormStatus.Live
        },
        { session }
      )
    )

    return {
      live,
      draft
    }
  } catch (err) {
    logger.error(
      err,
      `Failed to read overview metrics for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Saves overview metric records for a form.
 * @param {string} formId
 * @param {FormStatus} formStatus
 * @param {FormOverviewMetric} metricData
 * @param {ClientSession} session
 */
export async function saveFormOverviewMetrics(
  formId,
  formStatus,
  metricData,
  session
) {
  const coll = getMetricCollection()

  try {
    await coll.insertOne(
      {
        ...metricData,
        formStatus
      },
      { session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to save overview metrics for form id ${formId} status ${formStatus} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Deletes overview metric records for all forms.
 * @param {ClientSession} session
 */
export async function deleteFormOverviewMetrics(session) {
  const coll = getMetricCollection()

  try {
    await coll.deleteMany(
      {
        type: FormMetricType.OverviewMetric
      },
      { session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to delete overview metrics for all forms - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets overview metric records for a form.
 * @param {string} formId
 * @param {ClientSession} session
 * @returns {Promise<WithId<FormTimelineMetric>[]>}
 */
export async function getFormTimelineMetrics(formId, session) {
  const coll = getMetricCollection()

  try {
    const timelineRecords =
      /** @type {FindCursor<WithId<FormTimelineMetric>>} */ (
        coll
          .find({ formId, type: FormMetricType.TimelineMetric }, { session })
          .sort({ createdAt: -1 })
      )
    return await timelineRecords.toArray()
  } catch (err) {
    logger.error(
      err,
      `Failed to read timeline metrics for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Get all overview metrics
 * @param {ClientSession} session
 * @returns {FindCursor<WithId<FormOverviewMetric>>}
 */
export function getAllOverviewMetrics(session) {
  return /** @type {FindCursor<WithId<FormOverviewMetric>>} */ (
    getAllMetricsOfType(FormMetricType.OverviewMetric, session)
  )
}

/**
 * Get all timeline metrics
 * @param {ClientSession} session
 * @returns {FindCursor<WithId<FormTimelineMetric>>}
 */
export function getAllTimelineMetrics(session) {
  return /** @type {FindCursor<WithId<FormTimelineMetric>>} */ (
    getAllMetricsOfType(FormMetricType.TimelineMetric, session)
  )
}

/**
 * Gets all metric records of the specified type.
 * @param {FormMetricType} metricType
 * @param {ClientSession} session
 * @returns {FindCursor<WithId<FormOverviewMetric | FormTimelineMetric>>}
 */
export function getAllMetricsOfType(metricType, session) {
  const coll = getMetricCollection()

  try {
    const cursor =
      /** @type {FindCursor<WithId<FormOverviewMetric | FormTimelineMetric>>} */ (
        coll.find({ type: metricType }, { session }).sort({ updatedAt: -1 })
      )
    return cursor
  } catch (err) {
    logger.error(err, `Failed to read all metrics - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Saves snapshot metric records for a form.
 * @param {string} formId
 * @param {FormTimelineMetric} metricData
 * @param {ClientSession} session
 */
export async function saveFormTimelineMetrics(formId, metricData, session) {
  const coll = getMetricCollection()

  try {
    await coll.insertOne(
      {
        ...metricData,
        formId,
        type: FormMetricType.TimelineMetric
      },
      { session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to save timeline metrics for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets metric totals record.
 * @param {ClientSession} session
 */
export function getMetricTotals(session) {
  const coll = getMetricCollection()

  try {
    return coll.findOne({ type: FormMetricType.TotalsMetric }, { session })
  } catch (err) {
    logger.error(err, `Failed to get totals metric - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Saves snapshot metric records for a form.
 * @param {Date} reportDate
 * @param {FormTotalsMetric} totals
 * @param {ClientSession} session
 */
export async function updateMetricTotals(reportDate, totals, session) {
  const coll = getMetricCollection()

  try {
    totals.updatedAt = reportDate
    await coll.deleteMany({ type: FormMetricType.TotalsMetric }, { session })
    await coll.insertOne(
      {
        ...totals,
        type: FormMetricType.TotalsMetric
      },
      { session }
    )
  } catch (err) {
    logger.error(err, `Failed to save totals metric - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Gets metric lock record and sets the lock if not already locked.
 * @param {ClientSession} session
 * @returns {Promise<{ lockSuccess: boolean, lastSuccessfulRun: Date | null }>}
 */
export async function grabLock(session) {
  const coll = getMetricCollection()
  const now = new Date()

  try {
    // Atomically try to grab the lock on existing record
    // Returns the document BEFORE update (or null if no match)
    const controlRecord = /** @type { WithId<FormMetricControl> | null } */ (
      await coll.findOneAndUpdate(
        { type: FORM_METRIC_CONTROL, locked: false },
        {
          $set: {
            locked: true,
            jobStart: now,
            jobEnd: null,
            updatedAt: now
          }
        },
        { returnDocument: 'before', session }
      )
    )

    // No record found - could be first deploy or record is locked
    if (!controlRecord) {
      // Check if record exists at all
      const existing = /** @type { WithId<FormMetricControl> | null } */ (
        await coll.findOne({ type: FORM_METRIC_CONTROL }, { session })
      )

      // First deploy - record doesn't exist, create it with lock
      if (!existing) {
        const firstLock = {
          type: FORM_METRIC_CONTROL,
          locked: true,
          jobStart: now,
          jobEnd: null,
          lastSuccessfulRunDate: null,
          lastRunResult: '',
          updatedAt: now
        }
        await coll.insertOne(firstLock, { session })
        return {
          lockSuccess: true,
          lastSuccessfulRun: null
        }
      }

      // Record exists but is already locked by another container
      return {
        lockSuccess: false,
        lastSuccessfulRun: existing.lastSuccessfulRunDate
      }
    }

    // Successfully grabbed the lock (record existed and was unlocked)
    return {
      lockSuccess: true,
      lastSuccessfulRun: controlRecord.lastSuccessfulRunDate
    }
  } catch (err) {
    logger.error(
      err,
      `Failed to read/update control record - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Removes the metric control lock and updates the control record.
 * @param {boolean} success
 * @param {string} message
 * @param {ClientSession} session
 */
export async function releaseLock(success, message, session) {
  const coll = getMetricCollection()

  const now = new Date()

  const lastRunDate = success ? { lastSuccessfulRunDate: now } : {}

  const updateObj = {
    $set: {
      locked: false,
      jobEnd: now,
      updatedAt: now,
      lastRunResult: success ? `Success: ${message}` : `Failure: ${message}`,
      ...lastRunDate
    }
  }

  try {
    await coll.updateOne(
      {
        type: FORM_METRIC_CONTROL
      },
      updateObj,
      {
        session
      }
    )
  } catch (err) {
    logger.error(err, `Failed to remove lock - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * @import { ClientSession, Collection, FindCursor, WithId } from 'mongodb'
 * @import { FormOverviewMetric, FormTimelineMetric, FormTotalsMetric } from '@defra/forms-model'
 */
