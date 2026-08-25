import { FormMetricName, FormStatus } from '@defra/forms-model'
import { addDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

import { client } from '~/src/mongo.js'
import { getAllTimelineMetrics } from '~/src/repositories/metrics-repository.js'

const YEAR_MONTH_FORMAT = 'yyyy-MM'
const UK_TIMEZONE = 'Europe/London'
const MM = 'MM'
const YYYY = 'yyyy'
const MONTHS_IN_A_YEAR = 12

/**
 * @typedef {Map<string, number>} FormsMap
 * @typedef {Map<string, FormsMap>} SubmissionsMap
 */

/**
 * Add leading zero to month, if needed
 * @param {number} monthNum
 */
function lpadMonth(monthNum) {
  return monthNum < 10 ? `0${monthNum}` : `${monthNum}`
}

/**
 * Generates a report of submissions each month per form
 * @param {Date} earliestDate - earliest date to build submissions count month/year buckets
 */
export async function generateSubmissionsReport(earliestDate) {
  const session = client.startSession()

  // Map of months. Within each month is a map of formIds and their submission counts
  const submissionsMap = /** @type {SubmissionsMap} */ (new Map())

  // Pre-populate the month placeholders in the map
  // Operate in UK timezone to avoid inaccuracies in month/year placeholders
  const yesterday = addDays(new Date(), -1)

  let currentMonth = Number.parseInt(
    formatInTimeZone(earliestDate, UK_TIMEZONE, MM)
  )
  let currentYear = Number.parseInt(
    formatInTimeZone(earliestDate, UK_TIMEZONE, YYYY)
  )

  const endMonth = Number.parseInt(formatInTimeZone(yesterday, UK_TIMEZONE, MM))
  const endYear = Number.parseInt(
    formatInTimeZone(yesterday, UK_TIMEZONE, YYYY)
  )

  const endMonthYearStr = `${endYear}-${lpadMonth(endMonth)}`

  let currentMonthYearStr

  // Loop through each month of each year, from earliest date to end date
  do {
    currentMonthYearStr = `${currentYear}-${lpadMonth(currentMonth)}`
    submissionsMap.set(currentMonthYearStr, /** @type {FormsMap} */ (new Map()))
    currentMonth++
    if (currentMonth > MONTHS_IN_A_YEAR) {
      currentYear++
      currentMonth = 1
    }
  } while (currentMonthYearStr.localeCompare(endMonthYearStr) < 0)

  try {
    // Live metrics only, and ignore any metrics from other languages otherwise we'll double-count
    // We don't need to filter on 'earliestDate' as that was purely for constructing the month/year buckets.
    // All records of type 'Submissions' will be read here.
    const timelineCursor = getAllTimelineMetrics(
      {
        metricName: FormMetricName.Submissions,
        formStatus: FormStatus.Live,
        createdAt: { $gte: earliestDate },
        language: { $exists: false }
      },
      session
    )

    // Assign each submission metric to the appropriate month/form bucket (calculated in UK time)
    for await (const timeline of timelineCursor) {
      const monthYear = formatAsYearMonthUK(timeline.createdAt)
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
function formatAsYearMonthUK(date) {
  return formatInTimeZone(date, UK_TIMEZONE, YEAR_MONTH_FORMAT)
}
