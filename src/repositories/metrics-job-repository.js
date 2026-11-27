import { FormMetricType, getErrorMessage } from '@defra/forms-model'
import { subHours } from 'date-fns'

import { logger } from '~/src/helpers/logging/logger.js'
import { getMetricCollection } from '~/src/repositories/metrics-repository-helper.js'

const FORM_METRIC_CONTROL = 'form-metric-control'
const MS_IN_A_DAY = 24 * 60 * 60 * 1000

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
    // Also handles stale locks (job started more than 2 hours ago but not finished)
    const controlRecord = /** @type { WithId<FormMetricControl> | null } */ (
      await coll.findOneAndUpdate(
        {
          type: FORM_METRIC_CONTROL,
          $or: [
            { locked: false },
            { jobEnd: null, jobStart: { $lt: subHours(now, 2) } }
          ]
        },
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
 * @param {{ success: boolean, message: string, endDate: Date | undefined }} result
 * @param {ClientSession} session
 */
export async function releaseLock({ success, message, endDate }, session) {
  const coll = getMetricCollection()

  const now = new Date()

  const lastRunDate = success ? { lastSuccessfulRunDate: endDate } : {}

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
 * Builds the filter for the metrics records to be deleted when clearing metrics.
 * If 'lastRetainedDate' is supplied, timeline metrics for that day (UTC) and earlier are retained.
 * @param { Date | undefined } lastRetainedDate
 */
export function buildClearMetricsFilter(lastRetainedDate) {
  if (!lastRetainedDate) {
    return { type: { $ne: FORM_METRIC_CONTROL } }
  }

  const lastRetainedDay = lastRetainedDate.toISOString().substring(0, 10)
  const cutoff = new Date(
    new Date(`${lastRetainedDay}T00:00:00.000Z`).getTime() + MS_IN_A_DAY
  )

  return {
    $or: [
      {
        type: {
          $nin: [FORM_METRIC_CONTROL, FormMetricType.TimelineMetric]
        }
      },
      {
        type: FormMetricType.TimelineMetric,
        createdAt: { $gte: cutoff }
      }
    ]
  }
}

/**
 * Clears metrics data (leaves the control record).
 * If 'lastRetainedDate' is supplied, timeline metrics up to and including that day are retained
 * (since the source records may no longer exist to regenerate them from), and the control record
 * is set so the next job run starts collecting from the following day.
 * Otherwise, all metrics are cleared and the next job run starts from the beginning.
 * @param {ClientSession} session
 * @param {Date} [lastRetainedDate]
 */
export async function clearMetricsData(session, lastRetainedDate) {
  const coll = getMetricCollection()

  try {
    await coll.deleteMany(buildClearMetricsFilter(lastRetainedDate), {
      session
    })
    await coll.updateOne(
      {
        type: FORM_METRIC_CONTROL
      },
      { $set: { lastSuccessfulRunDate: lastRetainedDate ?? null } },
      { session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to clear all metrics data - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession, WithId } from 'mongodb'
 * @import { FormMetricControl } from '~/src/service/metrics.js'
 */
