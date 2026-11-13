import { FormMetricName, FormMetricType } from '@defra/forms-model'

import { getErrorMessage } from '~/src/helpers/error-message.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { METRICS_COLLECTION_NAME, db } from '~/src/mongo.js'

/**
 * Creates a filter to query records with a specific language (or all records if language not provided)
 * @param { string | undefined } language
 */
export function getLanguageFilter(language) {
  return language ? { language } : {}
}

/**
 * Creates a filter to query records with a specific language (or ONLY records that do NOT have a  language property)
 * @param { string | undefined } language
 */
export function getLanguageNoPropertyFilter(language) {
  return language ? { language } : { language: { $exists: false } }
}

/**
 * Creates a filter to query records with a specific language,
 * with metric names included in FormMetricName
 * @param { string | undefined } language
 */
export function getAllFormMetricsFilter(language) {
  return {
    ...getLanguageNoPropertyFilter(language),
    metricName: { $in: Object.values(FormMetricName) }
  }
}

/**
 * Adjusts the earliest data date based on a new submission date
 * @param { Date | undefined } earliestDataDate
 * @param {Date} createdAtSubmission
 * @returns {Date}
 */
export function adjustEarliestDate(earliestDataDate, createdAtSubmission) {
  if (!earliestDataDate || createdAtSubmission < earliestDataDate) {
    return createdAtSubmission
  }
  return earliestDataDate
}

/**
 * Gets the metric collection
 * @returns {Collection<FormOverviewMetric | FormTimelineMetric | FunctionalAreaTimelineMetric | FormTotalsMetric | FunctionalAreaTotalsMetric | FormDrilldownMetric | FormMetricControl>}
 */
export function getMetricCollection() {
  return /** @type {Collection<FormOverviewMetric | FormTimelineMetric | FunctionalAreaTimelineMetric | FormTotalsMetric | FunctionalAreaTotalsMetric | FormDrilldownMetric | FormMetricControl>} */ (
    db.collection(METRICS_COLLECTION_NAME)
  )
}

/**
 * Determines if any other publish events exist for this form
 * @param {string} formId
 * @param { string | undefined } language
 * @param {ClientSession} session
 * @returns {Promise<boolean>}
 */
export async function isFirstPublish(formId, language, session) {
  const coll = getMetricCollection()

  try {
    const firstPublished = await coll.findOne(
      {
        type: FormMetricType.TimelineMetric,
        metricName: FormMetricName.FormsFirstPublished,
        formId,
        ...getLanguageFilter(language)
      },
      { session }
    )
    return firstPublished === null
  } catch (err) {
    logger.error(
      err,
      `Failed to read timeline isFirstPublish for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets the earliest 'draft created' record of a form
 * @param {string} formId
 * @param { string | undefined } language
 * @param {ClientSession} session
 * @returns {Promise< WithId<FormTimelineMetric> | undefined >}
 */
export async function getFirstDraft(formId, language, session) {
  const coll = getMetricCollection()

  try {
    const drafts = /** @type {WithId<FormTimelineMetric>[]} */ (
      await coll
        .find(
          {
            type: FormMetricType.TimelineMetric,
            metricName: FormMetricName.NewFormsCreated,
            formId,
            ...getLanguageFilter(language)
          },
          { session }
        )
        .sort({ createdAt: 1 })
        .toArray()
    )
    return drafts.length > 0 ? drafts[0] : undefined
  } catch (err) {
    logger.error(
      err,
      `Failed to read timeline getFirstDraft for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession, Collection, WithId } from 'mongodb'
 * @import { FormOverviewMetric, FormTimelineMetric, FormTotalsMetric, FormDrilldownMetric, FunctionalAreaTotalsMetric, FunctionalAreaTimelineMetric } from '@defra/forms-model'
 * @import { FormMetricControl } from '~/src/service/metrics.js'
 */
