import { FormMetricName, FormStatus } from '@defra/forms-model'
import { addDays, addMonths, format } from 'date-fns'

import { client } from '~/src/mongo.js'
import { getAllTimelineMetrics } from '~/src/repositories/metrics-repository.js'

const YEAR_MONTH_FORMAT = 'yyyy-MM'

/**
 * @typedef {Map<string, number>} FormsMap
 * @typedef {Map<string, FormsMap>} SubmissionsMap
 */

/**
 * Generates a report of submissions each month per form
 * @param {Date} earliestDate - earliest date to build submissions counts
 */
export async function generateSubmissionsReport(earliestDate) {
  const session = client.startSession()

  // Map of months. Within each month is a map of formIds and their submission counts
  const submissionsMap = /** @type {SubmissionsMap} */ (new Map())

  // Pre-populate the month placeholders in the map
  const yesterdayAsMonthYear = formatAsYearMonth(addDays(new Date(), -1))
  let currentDate = formatAsYearMonth(earliestDate)
  do {
    submissionsMap.set(currentDate, /** @type {FormsMap} */ (new Map()))
    const nextMonth = addMonths(new Date(`${currentDate}-01`), 1)
    currentDate = formatAsYearMonth(nextMonth)
  } while (currentDate <= yesterdayAsMonthYear)

  try {
    // Live metrics only, and ignore any metrics from other languages otherwise we'll double-count
    const timelineCursor = getAllTimelineMetrics(
      {
        metricName: FormMetricName.Submissions,
        formStatus: FormStatus.Live,
        language: { $exists: false }
      },
      session
    )

    // Assign each submission metric to the appropriate month/form bucket
    for await (const timeline of timelineCursor) {
      const monthYear = formatAsYearMonth(timeline.createdAt)
      const monthMap = submissionsMap.get(monthYear)
      const count = monthMap?.get(timeline.formId) ?? 0
      monthMap?.set(timeline.formId, timeline.metricValue + count)
    }

    // Convert nested map into a JSON structure
    return Object.fromEntries(
      [...submissionsMap].map(([key, innerMap]) => [
        key,
        Object.fromEntries(innerMap)
      ])
    )
  } finally {
    await session.endSession()
  }
}

/**
 * Format as year-month i.e. 2026-05
 * @param {Date} date
 */
function formatAsYearMonth(date) {
  return format(date, YEAR_MONTH_FORMAT)
}
