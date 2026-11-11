import { FormMetricType, getErrorMessage } from '@defra/forms-model'

import { logger } from '~/src/helpers/logging/logger.js'
import { getMetricCollection } from '~/src/repositories/metrics-repository-helper.js'

/**
 * Saves snapshot metric records for a form.
 * @param {SigninTimelineMetric} metricData
 * @param {ClientSession} session
 */
export async function saveSigninTimelineMetrics(metricData, session) {
  const coll = getMetricCollection()

  try {
    await coll.insertOne(
      {
        ...metricData,
        type: FormMetricType.TimelineMetric
      },
      { session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to save signin timeline metrics - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession } from 'mongodb'
 * @import { SigninTimelineMetric } from '@defra/forms-model'
 */
