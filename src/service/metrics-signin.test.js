import { AuditEventMessageType, SigninMetricName } from '@defra/forms-model'

import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import { saveFunctionalAreaTimelineMetrics } from '~/src/repositories/metrics-func-area-repository.js'
import {
  allowedSigninMetricNames,
  collectSigninMetricsFromAudit
} from '~/src/service/metrics-signin.js'

jest.mock('~/src/repositories/audit-record-repository.js')
jest.mock('~/src/repositories/metrics-func-area-repository.js')

/**
 * @param {object[]} rows
 */
function createAsyncIterator(rows) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const row of rows) {
        yield await Promise.resolve(row)
      }
    }
  }
}

describe('metrics-signin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('exports all supported sign-in metric names for recalculation', () => {
    expect(allowedSigninMetricNames).toEqual(Object.values(SigninMetricName))
  })

  it('collects and stores one timeline metric for each supported identity audit type', async () => {
    const reportingDate = new Date('2026-05-01T10:00:00.000Z')
    const createdAt = new Date('2026-04-30T10:00:00.000Z')
    jest
      .mocked(getAuditRecordsOfType)
      // @ts-expect-error - async iterator mock for a Mongo cursor
      .mockReturnValue(createAsyncIterator([{ createdAt }]))

    await collectSigninMetricsFromAudit(reportingDate, /** @type {any} */ ({}))

    const expectedTypesAndNames = [
      [
        AuditEventMessageType.IDENTITY_REGISTRATION,
        SigninMetricName.Registration
      ],
      [
        AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL,
        SigninMetricName.SuccessfulAuthentication
      ],
      [
        AuditEventMessageType.IDENTITY_TOO_MANY_OTPS_REQUESTED,
        SigninMetricName.TooManyCodeRequests
      ],
      [
        AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
        SigninMetricName.IncorrectCodeEntered
      ],
      [
        AuditEventMessageType.IDENTITY_ACCOUNT_DELETION,
        SigninMetricName.AccountDeletion
      ],
      [
        AuditEventMessageType.IDENTITY_EMAIL_ADDRESS_UPDATED,
        SigninMetricName.EmailAddressUpdate
      ],
      [
        AuditEventMessageType.IDENTITY_PHONE_NUMBER_UPDATED,
        SigninMetricName.PhoneNumberUpdate
      ]
    ]

    expect(getAuditRecordsOfType).toHaveBeenCalledTimes(
      expectedTypesAndNames.length
    )
    for (const [
      index,
      [eventType, metricName]
    ] of expectedTypesAndNames.entries()) {
      expect(getAuditRecordsOfType).toHaveBeenNthCalledWith(
        index + 1,
        eventType,
        reportingDate,
        undefined,
        expect.anything()
      )
      expect(saveFunctionalAreaTimelineMetrics).toHaveBeenNthCalledWith(
        index + 1,
        { metricName, metricValue: 1, createdAt },
        expect.anything()
      )
    }
  })
})
