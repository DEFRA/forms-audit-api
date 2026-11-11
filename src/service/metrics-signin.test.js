import {
  AuditEventMessageType,
  FormMetricType,
  FunctionalAreaType,
  SigninMetricName
} from '@defra/forms-model'

import { client } from '~/src/mongo.js'
import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import { saveSigninTimelineMetrics } from '~/src/repositories/metrics-func-area-repository.js'
import {
  getAllTimelineMetrics,
  getFunctionalAreaMetricTotals
} from '~/src/repositories/metrics-repository.js'
import {
  collectSigninMetricsFromAudit,
  generateFunctionalAreaReport,
  recalcSigninMetrics
} from '~/src/service/metrics-signin.js'
import { calcAverages } from '~/src/service/metrics.js'

jest.mock('~/src/repositories/audit-record-repository.js')
jest.mock('~/src/repositories/metrics-repository.js')
jest.mock('~/src/repositories/metrics-func-area-repository.js')
jest.mock('~/src/service/metrics.js', () => ({
  calcAverages: jest.fn((totals) => totals)
}))
jest.mock('~/src/mongo.js', () => ({
  client: {
    startSession: jest.fn()
  }
}))

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
  const session = /** @type {any} */ ({
    endSession: jest.fn().mockResolvedValue(undefined)
  })

  beforeEach(() => {
    jest.mocked(client.startSession).mockReturnValue(session)
    jest.mocked(calcAverages).mockImplementation((totals) => totals)
  })

  describe('collectSigninMetricsFromAudit', () => {
    it('saves timeline metrics for each supported identity audit type', async () => {
      const createdAt = new Date('2026-05-01T10:00:00.000Z')
      jest
        .mocked(getAuditRecordsOfType)
        // @ts-expect-error - async iterator mock for a Mongo cursor
        .mockReturnValue(createAsyncIterator([{ createdAt }]))

      await collectSigninMetricsFromAudit(createdAt, session)

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
          createdAt,
          undefined,
          session
        )
        expect(saveSigninTimelineMetrics).toHaveBeenNthCalledWith(
          index + 1,
          { metricName, metricValue: 1, createdAt },
          session
        )
      }
    })
  })

  describe('recalcSigninMetrics', () => {
    it('aggregates sign-in counts into reporting periods and finds the earliest metric', async () => {
      const metrics = [
        {
          metricName: SigninMetricName.SuccessfulAuthentication,
          metricValue: 2,
          createdAt: new Date('2026-05-08T10:00:00.000Z')
        },
        {
          metricName: SigninMetricName.Registration,
          metricValue: 3,
          createdAt: new Date('2026-05-01T10:00:00.000Z')
        },
        {
          metricName: SigninMetricName.Registration,
          metricValue: 4,
          createdAt: new Date('2026-04-01T10:00:00.000Z')
        },
        {
          metricName: SigninMetricName.TooManyCodeRequests,
          metricValue: 5,
          createdAt: new Date('2025-04-01T10:00:00.000Z')
        }
      ]
      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - async iterator mock for a Mongo cursor
        .mockReturnValue(createAsyncIterator(metrics))

      const totals = await recalcSigninMetrics(
        new Date('2026-05-10T12:00:00.000Z'),
        session
      )

      expect(getAllTimelineMetrics).toHaveBeenCalledWith(
        { metricName: { $in: Object.values(SigninMetricName) } },
        session
      )
      expect(totals).toMatchObject({
        area: FunctionalAreaType.Signin,
        earliestDate: new Date('2025-04-01T10:00:00.000Z'),
        last7Days: {
          [SigninMetricName.SuccessfulAuthentication]: { count: 2 }
        },
        prev7Days: {
          [SigninMetricName.Registration]: { count: 3 }
        },
        last30Days: {
          [SigninMetricName.SuccessfulAuthentication]: { count: 2 },
          [SigninMetricName.Registration]: { count: 3 }
        },
        prev30Days: {
          [SigninMetricName.Registration]: { count: 4 }
        },
        lastYear: {
          [SigninMetricName.SuccessfulAuthentication]: { count: 2 },
          [SigninMetricName.Registration]: { count: 7 }
        },
        prevYear: {
          [SigninMetricName.TooManyCodeRequests]: { count: 5 }
        },
        allTime: {
          [SigninMetricName.SuccessfulAuthentication]: { count: 2 },
          [SigninMetricName.Registration]: { count: 7 },
          [SigninMetricName.TooManyCodeRequests]: { count: 5 }
        }
      })
      expect(calcAverages).toHaveBeenCalledWith(totals)
    })

    it('uses the fallback earliest date when no sign-in metrics exist', async () => {
      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - async iterator mock for a Mongo cursor
        .mockReturnValue(createAsyncIterator([]))

      const totals = await recalcSigninMetrics(
        new Date('2026-05-10T12:00:00.000Z'),
        session
      )

      expect(totals.earliestDate).toEqual(new Date('2025-12-01'))
      expect(totals.area).toBe(FunctionalAreaType.Signin)
    })
  })

  describe('generateFunctionalAreaReport', () => {
    it('returns stored totals and ends its database session', async () => {
      const totals = {
        type: FormMetricType.FunctionalAreaTotalsMetric,
        area: FunctionalAreaType.Signin
      }
      // @ts-expect-error - partial data mock
      jest.mocked(getFunctionalAreaMetricTotals).mockResolvedValue(totals)

      const report = await generateFunctionalAreaReport(
        FunctionalAreaType.Signin
      )

      expect(client.startSession).toHaveBeenCalled()
      expect(getFunctionalAreaMetricTotals).toHaveBeenCalledWith(
        FunctionalAreaType.Signin,
        session
      )
      expect(report).toEqual({ totals })
      expect(session.endSession).toHaveBeenCalled()
    })

    it('ends its database session when reading totals fails', async () => {
      const error = new Error('Failed to read totals')
      jest.mocked(getFunctionalAreaMetricTotals).mockRejectedValueOnce(error)

      await expect(
        generateFunctionalAreaReport(FunctionalAreaType.Signin)
      ).rejects.toThrow(error)

      expect(session.endSession).toHaveBeenCalled()
    })
  })
})
