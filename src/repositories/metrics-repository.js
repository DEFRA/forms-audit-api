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
 * @property { Date | undefined } jobEnd - timestamp for when the job ended
 * @property { Date | undefined } lastSuccessfulRunDate - timestamp for when the last successful run started
 * @property {string} lastRunResult - outcome of last run
 * @property {Date} updatedAt - last updated timestamp
 */

/**
 * Gets the metric overview collection
 * @returns {Collection<FormOverviewMetric>}
 */
function getOverviewCollection() {
  return /** @type {Collection<FormOverviewMetric>} */ (
    db.collection(METRICS_COLLECTION_NAME)
  )
}

/**
 * Gets the metric snapshot collection
 * @returns {Collection<FormSnapshotMetric>}
 */
function getSnapshotCollection() {
  return /** @type {Collection<FormSnapshotMetric>} */ (
    db.collection(METRICS_COLLECTION_NAME)
  )
}

/**
 * Gets the lock collection
 * @returns {Collection<FormMetricControl>}
 */
function getControlCollection() {
  return /** @type {Collection<FormMetricControl>} */ (
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
  const coll = getOverviewCollection()

  try {
    const draft = await coll.findOne(
      {
        type: FormMetricType.OverviewMetric,
        formId,
        formStatus: FormStatus.Draft
      },
      { session }
    )

    const live = await coll.findOne(
      {
        type: FormMetricType.OverviewMetric,
        formId,
        formStatus: FormStatus.Live
      },
      { session }
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
  const coll = getOverviewCollection()

  try {
    await coll.updateOne(
      { type: FormMetricType.OverviewMetric, formId, formStatus },
      { $set: { metricData } },
      { upsert: true, session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to save overview metrics for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets overview metric records for a form.
 * @param {string} formId
 * @param {ClientSession} session
 * @returns {Promise<WithId<FormSnapshotMetric>[]>}
 */
export async function getFormSnapshotMetrics(formId, session) {
  const coll = getSnapshotCollection()

  try {
    const snapshots = coll
      .find({ formId, type: FormMetricType.SnapshotMetric }, { session })
      .sort({ updatedAt: -1 })
    return await snapshots.toArray()
  } catch (err) {
    logger.error(
      err,
      `Failed to read snapshot metrics for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Saves snapshot metric records for a form.
 * @param {string} formId
 * @param {FormSnapshotMetric} metricData
 * @param {ClientSession} session
 */
export async function saveFormSnapshotMetrics(formId, metricData, session) {
  const coll = getSnapshotCollection()

  try {
    await coll.insertOne(
      {
        ...metricData,
        formId,
        type: FormMetricType.SnapshotMetric
      },
      { session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to save overview metrics for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets metric lock record and sets the lock if not already locked.
 * @param {ClientSession} session
 * @returns {Promise<boolean>}
 */
export async function grabLock(session) {
  const coll = getControlCollection()

  const now = new Date()

  try {
    const controlRecord = await coll.findOne(
      { type: FORM_METRIC_CONTROL },
      { session }
    )

    // Insert if the first time
    if (!controlRecord) {
      const firstLock = {
        type: FORM_METRIC_CONTROL,
        locked: true,
        jobStart: now,
        jobEnd: undefined,
        lastSuccessfulRunDate: undefined,
        lastRunResult: '',
        updatedAt: now
      }
      await coll.insertOne(firstLock, { session })
      return true
    }

    // Another container already has the lock
    if (controlRecord.locked) {
      return false
    }

    await coll.updateOne(
      {
        type: FORM_METRIC_CONTROL
      },
      {
        $set: {
          locked: true,
          jobStart: now,
          jobEnd: undefined,
          updatedAt: now
        }
      },
      {
        session
      }
    )
    return true
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
  const coll = getControlCollection()

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
 * @import { ClientSession, Collection, WithId } from 'mongodb'
 * @import { FormOverviewMetric, FormSnapshotMetric } from '@defra/forms-model'
 */
