import {
  AuditEventMessageType,
  CopyAnswersMetricName,
  FormMetricName,
  FormMetricType,
  FormStatus,
  FunctionalAreaType,
  SigninMetricName
} from '@defra/forms-model'
import { endOfDay } from 'date-fns'

import { client } from '~/src/mongo.js'
import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import { saveFunctionalAreaTimelineMetrics } from '~/src/repositories/metrics-func-area-repository.js'
import {
  getAllOverviewMetrics,
  getAllTimelineMetrics,
  getFunctionalAreaMetricTotals
} from '~/src/repositories/metrics-repository.js'
import {
  CalculationTypes,
  applySubmissionCountsForFunctionalArea,
  collectFunctionalAreaMetricsFromAuditByType,
  generateFunctionalAreaReport,
  getMetricCalcType,
  handleDraftSubmissions,
  handleLiveSubmissions,
  handleMetricValue,
  handleTimeslot,
  isDraftSubmission,
  isLiveSubmission,
  recalcFunctionalAreaMetrics,
  setTimeOnDate
} from '~/src/service/metrics-helper.js'
import { calcAverages } from '~/src/service/metrics.js'

jest.mock('~/src/repositories/audit-record-repository.js')
jest.mock('~/src/repositories/metrics-func-area-repository.js')
jest.mock('~/src/repositories/metrics-repository.js')
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

describe('metrics-helper', () => {
  const session = /** @type {any} */ ({
    endSession: jest.fn().mockResolvedValue(undefined)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(client.startSession).mockReturnValue(session)
    jest.mocked(calcAverages).mockImplementation((totals) => totals)
    session.endSession.mockResolvedValue(undefined)
  })

  describe('setTimeOnDate', () => {
    it('should set time on date', () => {
      const testDateStr = '2026-02-05'
      const expectedDate = new Date('2026-02-05T08:59:34.000Z')
      expect(setTimeOnDate(testDateStr, expectedDate)).toEqual(expectedDate)
    })
  })

  describe('getMetricCalcType', () => {
    it('should return the configured calculation type', () => {
      expect(
        getMetricCalcType({
          type: FormMetricType.TimelineMetric,
          metricName: FormMetricName.Submissions,
          formId: 'form-id',
          formStatus: FormStatus.Live,
          metricValue: 1,
          createdAt: new Date('2026-05-01T00:00:00.000Z')
        })
      ).toBe(CalculationTypes.AccumulationWithDrilldown)
    })
  })

  describe('handleTimeslot', () => {
    const metric = /** @type {FormTimelineMetric} */ ({
      metricName: FormMetricName.FormsInDraft,
      formStatus: FormStatus.Draft,
      metricValue: 3
    })
    const startOfSlot = new Date('2026-05-01T00:00:00.000Z')
    const endOfSlot = new Date('2026-05-02T00:00:00.000Z')

    it('should include metrics on the start and end dates', () => {
      const period = /** @type {Record<string, { count?: number }>} */ ({})
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        startOfSlot,
        startOfSlot,
        endOfSlot
      )
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        endOfDay(endOfSlot),
        startOfSlot,
        endOfSlot
      )

      expect(period).toEqual({ FormsInDraft: { count: 6 } })
    })

    it('should ignore metrics outside the slot', () => {
      const period = /** @type {Record<string, { count?: number }>} */ ({})
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        new Date('2026-04-30T23:59:59.999Z'),
        startOfSlot,
        endOfSlot
      )
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        new Date('2026-05-03T00:00:00.000Z'),
        startOfSlot,
        endOfSlot
      )

      expect(period).toEqual({})
    })
  })

  describe('handleMetricValue', () => {
    it('should handle accumulation with drilldown', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.Submissions,
        formStatus: FormStatus.Live,
        metricValue: 5
      })
      const period = { Submissions: { count: 1 } }
      handleMetricValue(
        metric,
        period,
        CalculationTypes.AccumulationWithDrilldown
      )
      expect(period).toEqual({
        Submissions: {
          count: 6
        }
      })
    })

    it('should handle accumulation', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.FormsInDraft,
        formStatus: FormStatus.Live,
        metricValue: 3
      })
      const period = { FormsInDraft: { count: 1 } }
      handleMetricValue(metric, period, CalculationTypes.Accumulation)
      expect(period).toEqual({
        FormsInDraft: {
          count: 4
        }
      })
    })

    it('should handle snapshot', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.TimeToPublish,
        formStatus: FormStatus.Live,
        metricValue: 3
      })
      const period = { TimeToPublish: { count: 7 } }
      handleMetricValue(metric, period, CalculationTypes.Snapshot)
      expect(period).toEqual({
        TimeToPublish: {
          count: 3
        }
      })
    })

    it('should handle average', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.TimeToPublish,
        formStatus: FormStatus.Live,
        metricValue: 3
      })
      const period = { TimeToPublish: { avgCount: 1, avgTotal: 15 } }
      // @ts-expect-error - partial mock of data
      handleMetricValue(metric, period, CalculationTypes.Average)
      expect(period).toEqual({
        TimeToPublish: {
          avgCount: 2,
          avgTotal: 18
        }
      })
    })
  })

  describe('submission helpers', () => {
    // @ts-expect-error - functional-area metric names are not FormMetricName values
    const liveSubmission = /** @type {FormTimelineMetric} */ ({
      type: FormMetricType.TimelineMetric,
      metricName: CopyAnswersMetricName.CopyAnswersSubmission,
      formId: 'live-form',
      formStatus: FormStatus.Live,
      metricValue: 3,
      createdAt: new Date('2026-05-01T10:00:00.000Z')
    })
    const draftSubmission = /** @type {FormTimelineMetric} */ ({
      ...liveSubmission,
      formId: 'draft-form',
      formStatus: FormStatus.Draft,
      metricValue: 2
    })

    it('recognises live and draft form and functional-area submissions', () => {
      expect(isLiveSubmission(liveSubmission)).toBe(true)
      expect(isDraftSubmission(draftSubmission)).toBe(true)
      expect(
        isLiveSubmission({
          ...liveSubmission,
          metricName: FormMetricName.Submissions
        })
      ).toBe(true)
      expect(
        isDraftSubmission({
          ...draftSubmission,
          metricName: FormMetricName.Submissions
        })
      ).toBe(true)
      expect(isDraftSubmission(liveSubmission)).toBe(false)
      expect(isLiveSubmission(draftSubmission)).toBe(false)
    })

    it('adds only matching submission metrics to each form map', () => {
      const liveCounts = new Map()
      const draftCounts = new Map()

      handleLiveSubmissions(liveSubmission, liveCounts)
      handleLiveSubmissions({ ...liveSubmission, metricValue: 4 }, liveCounts)
      handleLiveSubmissions(draftSubmission, liveCounts)
      handleDraftSubmissions(draftSubmission, draftCounts)
      handleDraftSubmissions(liveSubmission, draftCounts)

      expect(liveCounts).toEqual(new Map([['live-form', 7]]))
      expect(draftCounts).toEqual(new Map([['draft-form', 2]]))
    })
  })

  describe('collectFunctionalAreaMetricsFromAuditByType', () => {
    it('stores one functional-area metric for each matching audit event', async () => {
      const createdAt = new Date('2026-05-01T10:00:00.000Z')
      jest
        .mocked(getAuditRecordsOfType)
        // @ts-expect-error - async iterator mock for a Mongo cursor
        .mockReturnValue(createAsyncIterator([{ createdAt }, { createdAt }]))

      await collectFunctionalAreaMetricsFromAuditByType(
        AuditEventMessageType.IDENTITY_REGISTRATION,
        SigninMetricName.Registration,
        createdAt,
        session
      )

      expect(getAuditRecordsOfType).toHaveBeenCalledWith(
        AuditEventMessageType.IDENTITY_REGISTRATION,
        createdAt,
        undefined,
        session
      )
      expect(saveFunctionalAreaTimelineMetrics).toHaveBeenCalledTimes(2)
      expect(saveFunctionalAreaTimelineMetrics).toHaveBeenNthCalledWith(
        1,
        {
          metricName: SigninMetricName.Registration,
          metricValue: 1,
          createdAt
        },
        session
      )
      expect(saveFunctionalAreaTimelineMetrics).toHaveBeenNthCalledWith(
        2,
        {
          metricName: SigninMetricName.Registration,
          metricValue: 1,
          createdAt
        },
        session
      )
    })
  })

  describe('recalcFunctionalAreaMetrics', () => {
    it('aggregates sign-in events, including metrics without a form status', async () => {
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
        }
      ]
      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - async iterator mock for a Mongo cursor
        .mockReturnValue(createAsyncIterator(metrics))

      const totals = await recalcFunctionalAreaMetrics(
        new Date('2026-05-10T12:00:00.000Z'),
        FunctionalAreaType.Signin,
        Object.values(SigninMetricName),
        session
      )

      expect(getAllTimelineMetrics).toHaveBeenCalledWith(
        { metricName: { $in: Object.values(SigninMetricName) } },
        session
      )
      expect(totals).toMatchObject({
        area: FunctionalAreaType.Signin,
        earliestDate: new Date('2026-05-01T10:00:00.000Z'),
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
        allTime: {
          [SigninMetricName.SuccessfulAuthentication]: { count: 2 },
          [SigninMetricName.Registration]: { count: 3 }
        }
      })
      expect(calcAverages).toHaveBeenCalledWith(totals)
    })

    it('aggregates Copy Answers events that do not carry a form status', async () => {
      const metrics = /** @type {FunctionalAreaTimelineMetric[]} */ ([
        {
          type: FormMetricType.TimelineMetric,
          metricName: CopyAnswersMetricName.CopyAnswersSubmission,
          metricValue: 4,
          createdAt: new Date('2026-05-09T10:00:00.000Z')
        },
        {
          type: FormMetricType.TimelineMetric,
          metricName: CopyAnswersMetricName.CopyAnswersSubmission,
          metricValue: 2,
          createdAt: new Date('2026-05-08T10:00:00.000Z')
        },
        {
          type: FormMetricType.TimelineMetric,
          metricName: CopyAnswersMetricName.CopyAnswersForm,
          metricValue: 1,
          createdAt: new Date('2026-05-09T10:00:00.000Z')
        }
      ])
      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - async iterator mock for a Mongo cursor
        .mockReturnValue(createAsyncIterator(metrics))

      const totals = await recalcFunctionalAreaMetrics(
        new Date('2026-05-10T12:00:00.000Z'),
        FunctionalAreaType.CopyAnswers,
        Object.values(CopyAnswersMetricName),
        session
      )

      expect(totals).toMatchObject({
        area: FunctionalAreaType.CopyAnswers,
        liveSubmissions: {},
        draftSubmissions: {},
        last7Days: {
          [CopyAnswersMetricName.CopyAnswersSubmission]: { count: 6 },
          [CopyAnswersMetricName.CopyAnswersForm]: { count: 1 }
        },
        allTime: {
          [CopyAnswersMetricName.CopyAnswersSubmission]: { count: 6 },
          [CopyAnswersMetricName.CopyAnswersForm]: { count: 1 }
        }
      })
    })

    it('uses the fallback earliest date when there are no functional-area metrics', async () => {
      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - async iterator mock for a Mongo cursor
        .mockReturnValue(createAsyncIterator([]))

      const totals = await recalcFunctionalAreaMetrics(
        new Date('2026-05-10T12:00:00.000Z'),
        FunctionalAreaType.CopyAnswers,
        Object.values(CopyAnswersMetricName),
        session
      )

      expect(totals.earliestDate).toEqual(new Date('2025-12-01'))
      expect(totals.area).toBe(FunctionalAreaType.CopyAnswers)
    })
  })

  describe('applySubmissionCountsForFunctionalArea', () => {
    it('selects live or draft submission counts based on form status and defaults to zero', () => {
      // @ts-expect-error - repository documents serialize feature maps as objects
      const overview = /** @type {FormOverviewMetric[]} */ ([
        {
          type: FormMetricType.OverviewMetric,
          formId: 'live-form',
          formStatus: FormStatus.Live,
          summaryMetrics: { name: 'Live form' },
          featureMetrics: { features: {} },
          submissionsCount: 0,
          updatedAt: new Date('2026-05-01T10:00:00.000Z')
        },
        {
          type: FormMetricType.OverviewMetric,
          formId: 'draft-form',
          formStatus: FormStatus.Draft,
          summaryMetrics: { name: 'Draft form' },
          featureMetrics: { features: {} },
          submissionsCount: 0,
          updatedAt: new Date('2026-05-01T10:00:00.000Z')
        },
        {
          type: FormMetricType.OverviewMetric,
          formId: 'other-form',
          formStatus: FormStatus.Live,
          summaryMetrics: { name: 'Other form' },
          featureMetrics: { features: {} },
          submissionsCount: 0,
          updatedAt: new Date('2026-05-01T10:00:00.000Z')
        }
      ])
      const totals = /** @type {FunctionalAreaTotalsMetric} */ ({
        type: FormMetricType.FunctionalAreaTotalsMetric,
        area: FunctionalAreaType.CopyAnswers,
        earliestDate: new Date('2025-12-01'),
        updatedAt: new Date('2026-05-01T10:00:00.000Z'),
        liveSubmissions: { 'live-form': 5 },
        draftSubmissions: { 'draft-form': 2 }
      })

      expect(
        applySubmissionCountsForFunctionalArea({ overview, totals })
      ).toEqual([
        {
          featureMetrics: overview[0].featureMetrics,
          summaryMetrics: overview[0].summaryMetrics,
          formId: 'live-form',
          formName: 'Live form',
          formStatus: FormStatus.Live,
          submissionsCount: 5
        },
        {
          featureMetrics: overview[1].featureMetrics,
          summaryMetrics: overview[1].summaryMetrics,
          formId: 'draft-form',
          formName: 'Draft form',
          formStatus: FormStatus.Draft,
          submissionsCount: 2
        },
        {
          featureMetrics: overview[2].featureMetrics,
          summaryMetrics: overview[2].summaryMetrics,
          formId: 'other-form',
          formName: 'Other form',
          formStatus: FormStatus.Live,
          submissionsCount: 0
        }
      ])
    })
  })

  describe('generateFunctionalAreaReport', () => {
    const totals = /** @type {FunctionalAreaTotalsMetric} */ ({
      type: FormMetricType.FunctionalAreaTotalsMetric,
      area: FunctionalAreaType.CopyAnswers,
      earliestDate: new Date('2025-12-01'),
      updatedAt: new Date('2026-05-01T10:00:00.000Z'),
      liveSubmissions: { 'copy-form': 3 },
      draftSubmissions: {}
    })

    it('filters overview forms to the selected functional area and adds submission counts', async () => {
      const overview = [
        {
          formId: 'copy-form',
          formStatus: FormStatus.Live,
          summaryMetrics: { name: 'Copy form' },
          featureMetrics: { features: { 'Copy answers': true } }
        },
        {
          formId: 'signin-form',
          formStatus: FormStatus.Live,
          summaryMetrics: { name: 'Sign-in form' },
          featureMetrics: { features: { 'no-metric-required': true } }
        }
      ]
      jest
        .mocked(getFunctionalAreaMetricTotals)
        // @ts-expect-error - mocked metric omits Mongo's _id
        .mockResolvedValue(totals)
      jest
        .mocked(getAllOverviewMetrics)
        // @ts-expect-error - minimal cursor mock
        .mockReturnValue({ toArray: jest.fn().mockResolvedValue(overview) })

      const report = await generateFunctionalAreaReport(
        FunctionalAreaType.CopyAnswers
      )

      expect(getFunctionalAreaMetricTotals).toHaveBeenCalledWith(
        FunctionalAreaType.CopyAnswers,
        session
      )
      expect(getAllOverviewMetrics).toHaveBeenCalledWith({}, session)
      expect(report).toEqual({
        totals,
        overview: [
          {
            featureMetrics: overview[0].featureMetrics,
            summaryMetrics: overview[0].summaryMetrics,
            formId: 'copy-form',
            formName: 'Copy form',
            formStatus: FormStatus.Live,
            submissionsCount: 3
          }
        ]
      })
      expect(session.endSession).toHaveBeenCalled()
    })

    it('ends the session when loading functional-area totals fails', async () => {
      const error = new Error('Failed to read totals')
      jest.mocked(getFunctionalAreaMetricTotals).mockRejectedValue(error)

      await expect(
        generateFunctionalAreaReport(FunctionalAreaType.Signin)
      ).rejects.toThrow(error)

      expect(session.endSession).toHaveBeenCalled()
    })
  })
})

/**
 * @import { FormOverviewMetric, FormTimelineMetric, FunctionalAreaTimelineMetric, FunctionalAreaTotalsMetric } from '@defra/forms-model'
 */
