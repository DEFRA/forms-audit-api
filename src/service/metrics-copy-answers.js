import {
  AuditEventMessageType,
  CopyAnswersMetricName
} from '@defra/forms-model'

import { collectFunctionalAreaMetricsFromAuditByType } from '~/src/service/metrics-helper.js'

export const allowedCopyAnswersMetricNames = Object.values(
  CopyAnswersMetricName
)

/**
 * Collect 'copy answers'' metrics from audit events
 * @param {Date} reportingDate
 * @param {ClientSession} session
 */
export async function collectCopyAnswersMetricsFromAudit(
  reportingDate,
  session
) {
  // NOTE - 'copy answers' submission metrics are collected during the submission processing and not here
  await collectFunctionalAreaMetricsFromAuditByType(
    AuditEventMessageType.FORM_OPTION_UPDATED,
    CopyAnswersMetricName.CopyAnswersForm,
    reportingDate,
    session
  )
}

/**
 * @import { ClientSession } from 'mongodb'
 */
