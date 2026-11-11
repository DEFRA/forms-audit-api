import {
  AuditEventMessageType,
  FunctionalAreaType,
  SigninMetricName
} from '@defra/forms-model'
import { startOfDay, subDays, subYears } from 'date-fns'

import { client } from '~/src/mongo.js'
import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import {
  getAllTimelineMetrics,
  getFunctionalAreaMetricTotals,
  saveSigninTimelineMetrics
} from '~/src/repositories/metrics-repository.js'
import {
  CalculationTypes,
  handleMetricValue,
  handleTimeslot
} from '~/src/service/metrics-helper.js'
import { calcAverages } from '~/src/service/metrics.js'

const allSigninMetricNames = Object.values(SigninMetricName)

/**
 * Collect signin metrics from audit events
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
export async function collectSigninMetricsFromAudit(reportingDate, session) {
  await collectSigninMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_REGISTRATION,
    SigninMetricName.Registration,
    reportingDate,
    session
  )
  await collectSigninMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL,
    SigninMetricName.SuccessfulAuthentication,
    reportingDate,
    session
  )
  await collectSigninMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_TOO_MANY_OTPS_REQUESTED,
    SigninMetricName.TooManyCodeRequests,
    reportingDate,
    session
  )
  await collectSigninMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
    SigninMetricName.IncorrectCodeEntered,
    reportingDate,
    session
  )
  await collectSigninMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_ACCOUNT_DELETION,
    SigninMetricName.AccountDeletion,
    reportingDate,
    session
  )
  await collectSigninMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_EMAIL_ADDRESS_UPDATED,
    SigninMetricName.EmailAddressUpdate,
    reportingDate,
    session
  )
  await collectSigninMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_PHONE_NUMBER_UPDATED,
    SigninMetricName.PhoneNumberUpdate,
    reportingDate,
    session
  )
}

/**
 * Collect signin metrics from audit events by type
 * @param {AuditEventMessageType} queryType
 * @param {string} metricName
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
async function collectSigninMetricsFromAuditByType(
  queryType,
  metricName,
  reportingDate,
  session
) {
  const cursor = getAuditRecordsOfType(
    queryType,
    reportingDate,
    undefined,
    session
  )
  for await (const created of cursor) {
    const metric = /** @type {SigninTimelineMetric} */ ({
      metricName,
      metricValue: 1,
      createdAt: created.createdAt
    })
    await saveSigninTimelineMetrics(metric, session)
  }
}

/**
 * Generates a report of sign-in (and other forms-identity) events
 * @param {Date} reportingDate
 * @param {ClientSession} session
 * @returns {Promise<FunctionalAreaTotalsMetric>}
 */
export async function recalcSigninMetrics(reportingDate, session) {
  const reportMorning = startOfDay(reportingDate)
  const sevenDaysAgo = subDays(reportMorning, 7)
  const fourteenDaysAgo = subDays(reportMorning, 14)
  const thirtyDaysAgo = subDays(reportMorning, 30)
  const sixtyDaysAgo = subDays(reportMorning, 60)
  const oneYearAgo = subYears(reportMorning, 1)
  const twoYearsAgo = subYears(reportMorning, 2)

  const totals = /** @type {FunctionalAreaTotalsMetric} */ ({
    last7Days: {},
    prev7Days: {},
    last30Days: {},
    prev30Days: {},
    lastYear: {},
    prevYear: {},
    allTime: {},
    area: FunctionalAreaType.Signin
  })

  /** @type { Date | undefined } */
  let earliestDataDate

  const metricCursor = getAllTimelineMetrics(
    { metricName: { $in: allSigninMetricNames } },
    session
  )

  for await (const metric of metricCursor) {
    // Find earliest metric
    const createdAt = new Date(metric.createdAt)
    if (!earliestDataDate || createdAt < earliestDataDate) {
      earliestDataDate = createdAt
    }

    // Last 7 days
    // prettier-ignore
    handleTimeslot(metric, totals.last7Days, CalculationTypes.Accumulation, createdAt, sevenDaysAgo, reportMorning, true)

    // Previous 7 days
    // prettier-ignore
    handleTimeslot(metric, totals.prev7Days, CalculationTypes.Accumulation, createdAt, fourteenDaysAgo, sevenDaysAgo)

    // Last 30 days
    // prettier-ignore
    handleTimeslot(metric, totals.last30Days, CalculationTypes.Accumulation, createdAt, thirtyDaysAgo, reportMorning, true)

    // Previous 30 days
    // prettier-ignore
    handleTimeslot(metric, totals.prev30Days, CalculationTypes.Accumulation, createdAt, sixtyDaysAgo, thirtyDaysAgo)

    // Last year
    // prettier-ignore
    handleTimeslot(metric, totals.lastYear, CalculationTypes.Accumulation, createdAt, oneYearAgo, reportMorning)

    // Previous year
    // prettier-ignore
    handleTimeslot(metric, totals.prevYear, CalculationTypes.Accumulation, createdAt, twoYearsAgo, oneYearAgo)

    // All time
    handleMetricValue(
      metric,
      totals.allTime,
      CalculationTypes.Accumulation,
      true
    )
  }
  // Approximate implementation date as fallback if no submissions found
  totals.earliestDate = earliestDataDate ?? new Date('2025-12-01')
  const finalTotals = calcAverages(totals)

  return finalTotals
}

/**
 * Generates a report based on the stored metrics for sign-in activities
 * @param {FunctionalAreaType} area - The functional area sub-type for which to generate the report
 */
export async function generateFunctionalAreaReport(area) {
  const session = client.startSession()

  try {
    // Get summary tiles
    const totals = await getFunctionalAreaMetricTotals(area, session)

    return {
      totals
    }
  } finally {
    await session.endSession()
  }
}

/**
 * @import { ClientSession } from 'mongodb'
 * @import { FunctionalAreaTotalsMetric, SigninTimelineMetric } from '@defra/forms-model'
 */
