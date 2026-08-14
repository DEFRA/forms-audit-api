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
 * Gets the metric collection
 * @returns {Collection<FormOverviewMetric | FormTimelineMetric | FormTotalsMetric | FormDrilldownMetric | FormMetricControl>}
 */
export function getMetricCollection() {
  return /** @type {Collection<FormOverviewMetric | FormTimelineMetric | FormTotalsMetric | FormDrilldownMetric | FormMetricControl>} */ (
    db.collection(METRICS_COLLECTION_NAME)
  )
}

/**
 * @import { Collection } from 'mongodb'
 * @import { FormOverviewMetric, FormTimelineMetric, FormTotalsMetric, FormDrilldownMetric } from '@defra/forms-model'
 * @import { FormMetricControl } from '~/src/service/metrics.js'
 */
