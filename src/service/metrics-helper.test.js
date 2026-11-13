import {
  AuditEventMessageType,
  CopyAnswersMetricName,
  FormMetricName,
  FormMetricType,
  FormStatus,
  FunctionalAreaType,
  SigninMetricName
} from '@defra/forms-model'

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
  constructPeriodTimeslots,
  generateFunctionalAreaReport,
  getMetricCalcType,
  handleAllTimeslots,
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

    it('includes the start and the instant before the exclusive end', () => {
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
        new Date(endOfSlot.getTime() - 1),
        startOfSlot,
        endOfSlot
      )

      expect(period).toEqual({ FormsInDraft: { count: 6 } })
    })

    it('excludes the instant before the start and the exclusive end', () => {
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
        endOfSlot,
        startOfSlot,
        endOfSlot
      )

      expect(period).toEqual({})
    })
  })

  describe('handleAllTimeslots', () => {
    const reportingDate = new Date(2026, 4, 10, 12)
    const reportEnd = new Date(2026, 4, 11)
    const metric = /** @type {WithId<FormTimelineMetric>} */ ({
      metricName: FormMetricName.NewFormsCreated,
      formStatus: FormStatus.Draft,
      formId: 'form-id',
      metricValue: 1,
      createdAt: reportingDate
    })

    /** @type {Array<['last7Days' | 'last30Days' | 'lastYear', 'prev7Days' | 'prev30Days' | 'prevYear', Date, Date]>} */
    const periods = [
      ['last7Days', 'prev7Days', new Date(2026, 4, 4), new Date(2026, 3, 27)],
      [
        'last30Days',
        'prev30Days',
        new Date(2026, 3, 11),
        new Date(2026, 2, 12)
      ],
      ['lastYear', 'prevYear', new Date(2025, 4, 11), new Date(2024, 4, 11)]
    ]

    it.each(periods)(
      'assigns %s and %s boundaries without overlap',
      (last, previous, boundary, previousStart) => {
        const timeslots = constructPeriodTimeslots(reportingDate)

        /** @type {Array<[Date, boolean, boolean]>} */
        const cases = [
          [new Date(previousStart.getTime() - 1), false, false],
          [previousStart, false, true],
          [new Date(boundary.getTime() - 1), false, true],
          [boundary, true, false],
          [new Date(reportEnd.getTime() - 1), true, false],
          [reportEnd, false, false]
        ]
        for (const [createdAt, expectedLast, expectedPrevious] of cases) {
          const totals = /** @type {FormTotalsMetric} */ ({
            last7Days: {},
            prev7Days: {},
            last30Days: {},
            prev30Days: {},
            lastYear: {},
            prevYear: {},
            allTime: {}
          })

          handleAllTimeslots(
            metric,
            totals,
            CalculationTypes.Accumulation,
            createdAt,
            timeslots
          )

          expect(Boolean(totals[last]?.NewFormsCreated)).toBe(expectedLast)
          expect(Boolean(totals[previous]?.NewFormsCreated)).toBe(
            expectedPrevious
          )
          expect(totals.allTime?.NewFormsCreated.count).toBe(1)
        }
      }
    )

    it('includes leap day in the reporting year and keeps years adjacent', () => {
      const timeslots = constructPeriodTimeslots(new Date(2024, 1, 29, 12))

      expect(timeslots.reportEnd).toEqual(new Date(2024, 2, 1))
      expect(timeslots.oneYearAgo).toEqual(new Date(2023, 2, 1))
      expect(timeslots.twoYearsAgo).toEqual(new Date(2022, 2, 1))
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
        {
          metricName: { $in: Object.values(SigninMetricName) }
        },
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

    it('aggregates Copy Answers submissions by form and status for the overview', async () => {
      const metrics =
        /** @type {(FunctionalAreaTimelineMetric & Pick<FormTimelineMetric, 'formId' | 'formStatus'>)[]} */ ([
          {
            type: FormMetricType.TimelineMetric,
            metricName: CopyAnswersMetricName.CopyAnswersSubmission,
            formId: 'form-1',
            formStatus: FormStatus.Live,
            metricValue: 4,
            createdAt: new Date('2026-05-09T10:00:00.000Z')
          },
          {
            type: FormMetricType.TimelineMetric,
            metricName: CopyAnswersMetricName.CopyAnswersSubmission,
            formId: 'form-1',
            formStatus: FormStatus.Live,
            metricValue: 2,
            createdAt: new Date('2026-05-08T10:00:00.000Z')
          },
          {
            type: FormMetricType.TimelineMetric,
            metricName: CopyAnswersMetricName.CopyAnswersSubmission,
            formId: 'form-1',
            formStatus: FormStatus.Draft,
            metricValue: 3,
            createdAt: new Date('2026-05-08T10:00:00.000Z')
          },
          {
            type: FormMetricType.TimelineMetric,
            metricName: CopyAnswersMetricName.CopyAnswersSubmission,
            formId: 'form-2',
            formStatus: FormStatus.Live,
            metricValue: 5,
            createdAt: new Date('2026-05-08T10:00:00.000Z')
          },
          {
            type: FormMetricType.TimelineMetric,
            metricName: CopyAnswersMetricName.CopyAnswersForm,
            formId: 'form-1',
            formStatus: FormStatus.Live,
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

      expect(getAllTimelineMetrics).toHaveBeenCalledWith(
        {
          metricName: { $in: Object.values(CopyAnswersMetricName) }
        },
        session
      )
      expect(totals).toMatchObject({
        area: FunctionalAreaType.CopyAnswers,
        liveSubmissions: { 'form-1': 6, 'form-2': 5 },
        draftSubmissions: { 'form-1': 3 },
        last7Days: {
          [CopyAnswersMetricName.CopyAnswersSubmission]: { count: 14 },
          [CopyAnswersMetricName.CopyAnswersForm]: { count: 1 }
        },
        allTime: {
          [CopyAnswersMetricName.CopyAnswersSubmission]: { count: 14 },
          [CopyAnswersMetricName.CopyAnswersForm]: { count: 1 }
        }
      })

      /** @type {Pick<FormOverviewMetric, 'type' | 'featureMetrics' | 'submissionsCount' | 'updatedAt'>} */
      const baseOverview = {
        type: FormMetricType.OverviewMetric,
        featureMetrics: { features: new Map() },
        submissionsCount: 0,
        updatedAt: new Date('2026-05-10T12:00:00.000Z')
      }
      /** @type {FormOverviewMetric[]} */
      const overview = [
        {
          ...baseOverview,
          formId: 'form-1',
          formStatus: FormStatus.Live,
          summaryMetrics: { name: 'Form 1' }
        },
        {
          ...baseOverview,
          formId: 'form-1',
          formStatus: FormStatus.Draft,
          summaryMetrics: { name: 'Form 1' }
        },
        {
          ...baseOverview,
          formId: 'form-2',
          formStatus: FormStatus.Live,
          summaryMetrics: { name: 'Form 2' }
        },
        {
          ...baseOverview,
          formId: 'form-3',
          formStatus: FormStatus.Live,
          summaryMetrics: { name: 'Form 3' }
        }
      ]
      expect(
        applySubmissionCountsForFunctionalArea({ overview, totals }).map(
          ({ submissionsCount }) => submissionsCount
        )
      ).toEqual([6, 3, 5, 0])
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
 * @import { WithId } from 'mongodb'
 * @import { FormOverviewMetric, FormTimelineMetric, FormTotalsMetric, FunctionalAreaTimelineMetric, FunctionalAreaTotalsMetric } from '@defra/forms-model'
 */
