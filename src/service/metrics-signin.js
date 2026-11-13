import { AuditEventMessageType, SigninMetricName } from '@defra/forms-model'

import { collectFunctionalAreaMetricsFromAuditByType } from '~/src/service/metrics-helper.js'

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
 * @import { ClientSession } from 'mongodb'
 */
