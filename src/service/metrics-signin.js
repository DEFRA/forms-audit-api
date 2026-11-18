import {
  AuditEventMessageType,
  FunctionalAreaType,
  SigninMetricName
} from '@defra/forms-model'

import { getErrorMessage } from '~/src/helpers/error-message.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { client } from '~/src/mongo.js'
import { adjustEarliestDate } from '~/src/repositories/metrics-repository-helper.js'
import {
  getAllTimelineMetrics,
  getFunctionalAreaMetricTotals
} from '~/src/repositories/metrics-repository.js'
import {
  CalculationTypes,
  calcAverages,
  collectFunctionalAreaMetricsFromAuditByType,
  constructPeriodTimeslots,
  emptyFunctionalAreaMetrics,
  handleAllTimeslots
} from '~/src/service/metrics-helper.js'

export const allowedSigninMetricNames = Object.values(SigninMetricName)

/**
 * Collect signin metrics from audit events
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
export async function collectSigninMetricsFromAudit(reportingDate, session) {
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_REGISTRATION,
    SigninMetricName.Registration,
    reportingDate,
    session
  )
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL,
    SigninMetricName.SuccessfulAuthentication,
    reportingDate,
    session
  )
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_TOO_MANY_OTPS_REQUESTED,
    SigninMetricName.TooManyCodeRequests,
    reportingDate,
    session
  )
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
    SigninMetricName.IncorrectCodeEntered,
    reportingDate,
    session
  )
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_ACCOUNT_DELETION,
    SigninMetricName.AccountDeletion,
    reportingDate,
    session
  )
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_EMAIL_ADDRESS_UPDATED,
    SigninMetricName.EmailAddressUpdate,
    reportingDate,
    session
  )
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.IDENTITY_PHONE_NUMBER_UPDATED,
    SigninMetricName.PhoneNumberUpdate,
    reportingDate,
    session
  )
}

/**
 * Generates a report of sign-in (and other forms-identity) events
 * @param {Date} reportingDate
 * @param {ClientSession} session
 * @returns {Promise<FunctionalAreaTotalsMetric>}
 */
export async function recalcSigninMetrics(reportingDate, session) {
  const timeslots = constructPeriodTimeslots(reportingDate)

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
    { metricName: { $in: allowedSigninMetricNames } },
    session
  )

  for await (const metric of metricCursor) {
    // Find earliest metric
    const createdAt = new Date(metric.createdAt)
    earliestDataDate = adjustEarliestDate(earliestDataDate, createdAt)

    handleAllTimeslots(
      metric,
      totals,
      CalculationTypes.Accumulation,
      createdAt,
      timeslots
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
  } catch (err) {
    logger.error(
      err,
      `Failed to generate functional area report - metrics records are probably missing - ${getErrorMessage(err)}`
    )
    return emptyFunctionalAreaMetrics(FunctionalAreaType.Signin)
  } finally {
    await session.endSession()
  }
}

/**
 * @import { ClientSession } from 'mongodb'
 * @import { FunctionalAreaTotalsMetric } from '@defra/forms-model'
 */
