import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'

import { getErrorMessage } from '~/src/helpers/error-message.js'
import { logger } from '~/src/helpers/logging/logger.js'
import {
  getLanguageFilter,
  getLanguageNoPropertyFilter,
  getMetricCollection
} from '~/src/repositories/metrics-repository-helper.js'
import { metricDrilldownPeriods } from '~/src/service/metrics-helper.js'

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
    // Upsert so a form returned more than once by the paged overview report is stored only once
    await coll.replaceOne(
      {
        type: FormMetricType.OverviewMetric,
        formId,
        formStatus
      },
      /** @type {WithoutId<FormOverviewMetric>} */ ({
        ...metricData,
        formStatus
      }),
      { session, upsert: true }
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
 * @param { string | undefined } language
 * @param {ClientSession} session
 * @returns {FindCursor<WithId<FormTimelineMetric>>}
 */
export function getFormTimelineMetricsCursor(formId, language, session) {
  const coll = getMetricCollection()

  try {
    const timelineRecords =
      /** @type {FindCursor<WithId<FormTimelineMetric>>} */ (
        coll
          .find(
            {
              formId,
              type: FormMetricType.TimelineMetric,
              ...getLanguageNoPropertyFilter(language)
            },
            { session }
          )
          .sort({ createdAt: -1 })
      )
    return timelineRecords
  } catch (err) {
    logger.error(
      err,
      `Failed to read timeline metrics for form id ${formId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets overview metric records for a form.
 * @param {string} formId
 * @param { string | undefined } language
 * @param {ClientSession} session
 * @returns {Promise<WithId<FormTimelineMetric>[]>}
 */
export async function getFormTimelineMetrics(formId, language, session) {
  return getFormTimelineMetricsCursor(formId, language, session).toArray()
}

/**
 * Get all overview metrics
 * @param {FilterCriteria} filter
 * @param {ClientSession} session
 * @returns {FindCursor<WithId<FormOverviewMetric>>}
 */
export function getAllOverviewMetrics(filter, session) {
  const coll = getMetricCollection()

  const filterPart1 = filter.searchText
    ? { 'summaryMetrics.name': { $regex: filter.searchText, $options: 'i' } }
    : {}

  const filterPart2 = filter.status
    ? { formStatus: { $in: filter.status } }
    : {}

  const filterPart3 = filter.org
    ? { 'summaryMetrics.organisation': { $in: filter.org } }
    : {}

  const filterPart4 = getLanguageFilter(filter.language)

  try {
    const cursor = /** @type {FindCursor<WithId<FormOverviewMetric>>} */ (
      coll
        .find(
          {
            type: FormMetricType.OverviewMetric,
            ...filterPart1,
            ...filterPart2,
            ...filterPart3,
            ...filterPart4
          },
          { session }
        )
        .sort({ updatedAt: -1 })
    )
    return cursor
  } catch (err) {
    logger.error(
      err,
      `Failed to read all overview metrics - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Get all timeline metrics
 * @param { Filter<WithId<FormTimelineMetric | FunctionalAreaTimelineMetric>> | undefined } filter
 * @param {ClientSession} session
 * @returns {FindCursor<WithId<FormTimelineMetric>>}
 */
export function getAllTimelineMetrics(filter, session) {
  const coll =
    /** @type {Collection<FormTimelineMetric | FunctionalAreaTimelineMetric>} */ (
      getMetricCollection()
    )

  try {
    const cursor = /** @type {FindCursor<WithId<FormTimelineMetric>>} */ (
      coll
        .find(
          {
            type: FormMetricType.TimelineMetric,
            ...filter
          },
          { session }
        )
        .sort({ updatedAt: -1 })
    )
    return cursor
  } catch (err) {
    logger.error(
      err,
      `Failed to read all timeline metrics - ${getErrorMessage(err)}`
    )
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
 * @param { string | undefined } language
 * @param {ClientSession} session
 */
export function getMetricTotals(language, session) {
  const coll = getMetricCollection()

  try {
    return /** @type {Promise<WithId<FormTotalsMetric>>} */ (
      coll.findOne(
        {
          type: FormMetricType.TotalsMetric,
          ...getLanguageNoPropertyFilter(language)
        },
        { session }
      )
    )
  } catch (err) {
    logger.error(err, `Failed to get totals metric - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Gets metric drilldown records.
 * @param {string} periodName
 * @param {FormMetricName} metricName
 * @param { string | undefined } language
 * @param {ClientSession} session
 */
export async function getDrilldownRecords(
  periodName,
  metricName,
  language,
  session
) {
  const coll = getMetricCollection()

  try {
    return await /** @type {Promise<WithId<FormDrilldownMetric>[]>} */ (
      coll
        .find(
          {
            type: FormMetricType.DrilldownMetric,
            periodName,
            metricName,
            ...getLanguageNoPropertyFilter(language)
          },
          { session }
        )
        .toArray()
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to get drilldown metrics - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets functional area metric totals record.
 * @param {FunctionalAreaType} area
 * @param {ClientSession} session
 */
export function getFunctionalAreaMetricTotals(area, session) {
  const coll = getMetricCollection()

  try {
    return /** @type {Promise<WithId<FunctionalAreaTotalsMetric>>} */ (
      coll.findOne(
        {
          type: FormMetricType.FunctionalAreaTotalsMetric,
          area
        },
        { session }
      )
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to get functional area totals metric for ${area} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Saves snapshot metric records for a form.
 * @param {Date} reportDate
 * @param {FormTotalsMetric[]} totalsList
 * @param {ClientSession} session
 */
export async function updateMetricTotals(reportDate, totalsList, session) {
  const coll = getMetricCollection()

  try {
    await coll.deleteMany({ type: FormMetricType.TotalsMetric }, { session })
    await coll.deleteMany({ type: FormMetricType.DrilldownMetric }, { session })

    for (let totals of totalsList) {
      // Extract drilldown detail from 'totals' data, and save as drilldown records
      totals = await saveDrilldown(totals, session)
      totals.updatedAt = reportDate

      // Now save 'totals' records with drilldown data removed
      await coll.insertOne(
        {
          ...totals,
          type: FormMetricType.TotalsMetric
        },
        { session }
      )
    }
  } catch (err) {
    logger.error(err, `Failed to save totals metric - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Saves snapshot metric records for functional areas.
 * @param {Date} reportDate
 * @param {FunctionalAreaTotalsMetric[]} totalsList
 * @param {ClientSession} session
 */
export async function updateFunctionalAreaMetricTotals(
  reportDate,
  totalsList,
  session
) {
  const coll = getMetricCollection()

  try {
    await coll.deleteMany(
      { type: FormMetricType.FunctionalAreaTotalsMetric },
      { session }
    )

    for (const totals of totalsList) {
      totals.updatedAt = reportDate
      await coll.insertOne(
        {
          ...totals,
          type: FormMetricType.FunctionalAreaTotalsMetric
        },
        { session }
      )
    }
  } catch (err) {
    logger.error(
      err,
      `Failed to save functional area totals metric - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Saves drilldown details.
 * @param {FormTotalsMetric} totals
 * @param {ClientSession} session
 */
export async function saveDrilldown(totals, session) {
  for (const periodName of metricDrilldownPeriods) {
    // @ts-expect-error - dynamic lookup
    const period = totals[periodName]
    if (!period) {
      continue
    }

    for (const metricName of Object.keys(period)) {
      const detail = period[metricName]
      if ('details' in detail) {
        const details = /** @type {FormDrilldownMetric[]} */ (detail.details)
        // Add 'language' property if supplied in the 'totals' record
        if (totals.language) {
          details.forEach((det) => {
            det.language = totals.language
          })
        }
        await saveDrilldownRecords(
          periodName,
          /** @type {FormMetricName} */ (metricName),
          details,
          session
        )
        // @ts-expect-error - dynamic lookup
        delete totals[periodName][metricName].details
      }
    }
  }

  return totals
}

/**
 * Saves drilldown metric records.
 * @param {string} periodName
 * @param {FormMetricName} metricName
 * @param {FormDrilldownMetric[]} details
 * @param {ClientSession} session
 */
export async function saveDrilldownRecords(
  periodName,
  metricName,
  details,
  session
) {
  const coll = getMetricCollection()

  if (details.length === 0) {
    return
  }

  try {
    await coll.insertMany(
      details.map((detail) => ({
        ...detail,
        metricName,
        periodName,
        type: FormMetricType.DrilldownMetric
      })),
      { session }
    )
  } catch (err) {
    logger.error(
      err,
      `Failed to save drilldown metric record - period: ${periodName} metricName: ${metricName} ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Gets the 'forms in draft' metric for the specified date and returns the value
 * @param {Date} reportingDate
 * @param { string | undefined } language
 * @param {ClientSession} session
 * @returns {Promise<number>}
 */
export async function getNumberOfFormsInDraft(
  reportingDate,
  language,
  session
) {
  const coll = getMetricCollection()

  const withoutTime = reportingDate.toISOString().substring(0, 10)
  const startOfDay = `${withoutTime}T00:00:00.000Z`
  const endOfDay = `${withoutTime}T23:59:59.999Z`

  const languageFilter = getLanguageNoPropertyFilter(language)

  try {
    const numberOfDrafts =
      /** @type {WithId<FormTimelineMetric> | undefined} */ (
        await coll.findOne(
          {
            type: FormMetricType.TimelineMetric,
            metricName: FormMetricName.FormsInDraft,
            createdAt: {
              $gte: new Date(startOfDay),
              $lte: new Date(endOfDay)
            },
            ...languageFilter
          },
          { session }
        )
      )
    return numberOfDrafts?.metricValue ?? 0
  } catch (err) {
    logger.error(
      err,
      `Failed to read timeline getNumberOfFormsInDraft for date ${reportingDate.toISOString()} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession, Collection, Filter, FindCursor, WithId, WithoutId } from 'mongodb'
 * @import { FormOverviewMetric, FormTimelineMetric, FormTotalsMetric, FormDrilldownMetric, FunctionalAreaTotalsMetric, FunctionalAreaType, FunctionalAreaTimelineMetric } from '@defra/forms-model'
 * @import { FilterCriteria } from '~/src/service/metrics.js'
 */
