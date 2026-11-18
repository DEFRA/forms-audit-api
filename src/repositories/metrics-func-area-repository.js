import { FormMetricType, getErrorMessage } from '@defra/forms-model'

import { logger } from '~/src/helpers/logging/logger.js'
import { getMetricCollection } from '~/src/repositories/metrics-repository-helper.js'

/**
 * Saves snapshot metric records for a form.
 * @param {FunctionalAreaTimelineMetric} metricData
 * @param {ClientSession} session
 */
export async function saveFunctionalAreaTimelineMetrics(metricData, session) {
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
      `Failed to save functional area timeline metrics for name ${metricData.metricName} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession } from 'mongodb'
 * @import { FunctionalAreaTimelineMetric } from '@defra/forms-model'
 */
