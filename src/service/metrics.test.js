import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'
import { startOfDay, sub } from 'date-fns'
import { ObjectId } from 'mongodb'

import { getJson } from '~/src/lib/fetch.js'
import { client } from '~/src/mongo.js'
import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import {
  clearMetricsData,
  getAllOverviewMetrics,
  getAllTimelineMetrics,
  getFirstDraft,
  getFormTimelineMetricsCursor,
  getMetricTotals,
  getNumberOfFormsInDraft,
  grabLock,
  isFirstPublish,
  releaseLock,
  saveFormOverviewMetrics,
  saveFormTimelineMetrics
} from '~/src/repositories/metrics-repository.js'
import {
  applyExtraColumns,
  clearMetricsDatabase,
  collectManagerOverviewMetrics,
  collectMetrics,
  collectTimelineMetrics,
  collectTimelineMetricsFromAudit,
  generateReport,
  generateReportForForm,
  getAllFormIds,
  getOverviewMetricsForForms,
  recalcMetrics,
  runMetricsCollectionJob,
  setMetricTotal,
  updateMetricAverage,
  updateMetricTotal
} from '~/src/service/metrics.js'

jest.mock('~/src/lib/fetch.js')
jest.mock('~/src/repositories/metrics-repository.js')
jest.mock('~/src/repositories/audit-record-repository.js')

jest.mock('~/src/mongo.js', () => ({
  client: {
    startSession: jest.fn()
  },
  db: {},
  METRICS_COLLECTION_NAME: 'metrics'
}))

/**
 * @param {FormMetricName} metricName
 * @param {FormStatus} formStatus
 * @param {string} dateStr
 * @param {number} metricValue
 * @param {string} [formId]
 */
function createTimelineMetric(
  metricName,
  formStatus,
  dateStr,
  metricValue,
  formId
) {
  /** @type {FormTimelineMetric} */
  return {
    type: FormMetricType.TimelineMetric,
    formId,
    formStatus,
    metricName,
    createdAt: new Date(dateStr),
    metricValue
  }
}

const firstCreated = /** @type {AuditRecordInput[]} */ ([
  {
    type: 'FORM_CREATED',
    entityId: 'form-id-1a',
    createdAt: new Date('2026-03-30')
  }
])
const mockAsyncIteratorFirstCreated = {
  [Symbol.asyncIterator]: function* () {
    for (const metric of firstCreated) {
      yield metric
    }
  }
}
const draftCreatedFromLive = /** @type {AuditRecordInput[]} */ ([
  {
    type: 'FORM_CREATED',
    entityId: 'form-id-1a',
    createdAt: new Date('2026-03-30')
  }
])
const mockAsyncIteratorDraftCreatedFromLive = {
  [Symbol.asyncIterator]: function* () {
    for (const metric of draftCreatedFromLive) {
      yield metric
    }
  }
}

const firstPublished = /** @type {AuditRecordInput[]} */ ([
  {
    type: 'FORM_LIVE_CREATED_FROM_DRAFT',
    entityId: 'form-id-1a',
    createdAt: new Date('2026-04-08')
  }
])
const mockAsyncIteratorFirstPublished = {
  [Symbol.asyncIterator]: function* () {
    for (const metric of firstPublished) {
      yield metric
    }
  }
}

const rePublished = /** @type {AuditRecordInput[]} */ ([
  {
    type: 'FORM_LIVE_CREATED_FROM_DRAFT',
    entityId: 'form-id-1a',
    createdAt: new Date('2026-04-14')
  }
])
const mockAsyncIteratorRePublished = {
  [Symbol.asyncIterator]: function* () {
    for (const metric of rePublished) {
      yield metric
    }
  }
}

describe('runMetricsCollectionJob', () => {
  /** @type {any} */
  const mockSession = {
    withTransaction: jest.fn(),
    endSession: jest.fn()
  }
  const now = new Date()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(now)

    mockSession.withTransaction = jest
      .fn()
      .mockImplementation(
        async (/** @type {() => Promise<any>} */ callback) => {
          return await callback()
        }
      )
    mockSession.endSession = jest.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should ignore when job already locked', async () => {
    jest.mocked(grabLock).mockResolvedValueOnce({
      lockSuccess: false,
      lastSuccessfulRun: null
    })

    const mockNewSession = /** @type {any} */ ({
      withTransaction: jest.fn().mockImplementation(async (callback) => {
        return await callback()
      }),
      endSession: jest.fn().mockResolvedValue(undefined)
    })
    jest.mocked(client.startSession).mockReturnValue(mockNewSession)

    await runMetricsCollectionJob()
    expect(getJson).not.toHaveBeenCalled()
  })

  it('should run job when able to lock', async () => {
    const threeDaysAgo = startOfDay(sub(now, { days: 3 }))
    const twoDaysAgo = startOfDay(sub(now, { days: 2 }))
    jest.mocked(grabLock).mockResolvedValueOnce({
      lockSuccess: true,
      lastSuccessfulRun: threeDaysAgo
    })

    const mockNewSession = /** @type {any} */ ({
      withTransaction: jest.fn().mockImplementation(async (callback) => {
        return await callback()
      }),
      endSession: jest.fn().mockResolvedValue(undefined)
    })
    jest.mocked(client.startSession).mockReturnValue(mockNewSession)
    jest
      .mocked(getJson)
      .mockResolvedValueOnce({ response: {}, body: ['form-id-1', 'form-id-2'] })
      .mockResolvedValueOnce({ response: {}, body: { draft: {}, live: {} } })
      .mockResolvedValueOnce({ response: {}, body: { timeline: [] } })
      .mockResolvedValueOnce({ response: {}, body: { timeline: [] } })

    const timelineMetrics = /** @type {FormTimelineMetric[]} */ ([])
    const mockAsyncIterator = {
      [Symbol.asyncIterator]: function* () {
        for (const metric of timelineMetrics) {
          yield metric
        }
      }
    }

    // @ts-expect-error - resolves to an async iterator like FindCursor<FormSubmissionDocument>
    jest.mocked(getAllTimelineMetrics).mockReturnValueOnce(mockAsyncIterator)

    await runMetricsCollectionJob()
    expect(getJson).toHaveBeenCalledTimes(3)
    expect(getJson).toHaveBeenNthCalledWith(
      1,
      new URL('http://localhost:3001/all-form-ids'),
      {}
    )
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      new URL(
        'http://localhost:3001/report/overview?ids=form-id-1&ids=form-id-2'
      ),
      {}
    )
    expect(getJson).toHaveBeenNthCalledWith(
      3,
      new URL(
        'http://localhost:3002/report/timeline?date=' + twoDaysAgo.toISOString()
      ),
      {}
    )
  })

  it('should log error if job fails', async () => {
    const threeDaysAgo = startOfDay(sub(now, { days: 3 }))
    jest.mocked(grabLock).mockResolvedValueOnce({
      lockSuccess: true,
      lastSuccessfulRun: threeDaysAgo
    })
    jest.mocked(getJson).mockImplementationOnce(() => {
      throw new Error('API JSON error')
    })

    const mockNewSession = /** @type {any} */ ({
      withTransaction: jest.fn().mockImplementation(async (callback) => {
        return await callback()
      }),
      endSession: jest.fn().mockResolvedValue(undefined)
    })
    jest.mocked(client.startSession).mockReturnValue(mockNewSession)

    await runMetricsCollectionJob()

    expect(releaseLock).toHaveBeenCalledWith(
      {
        success: false,
        message: 'API JSON error',
        endDate: undefined,
        processMoreBatches: false
      },
      expect.anything()
    )
  })

  describe('collectManagerOverviewMetrics', () => {
    it('should save each metric as one batch when batch is less than 20 in size', async () => {
      jest
        .mocked(getJson)
        .mockResolvedValueOnce({
          response: {},
          body: ['form-id-1', 'form-id-2']
        })
        .mockResolvedValueOnce({
          response: {},
          body: {
            draft: [{ draftProperty: 123 }],
            live: [{ liveProperty: 123 }]
          }
        })

      await collectManagerOverviewMetrics(mockSession)
      expect(saveFormOverviewMetrics).toHaveBeenCalledTimes(2)
    })

    it('should save each metric as multiple batches when more than 20 in size', async () => {
      jest
        .mocked(getJson)
        .mockResolvedValueOnce({
          response: {},
          body: Array(25).fill('form-id')
        })
        .mockResolvedValueOnce({
          response: {},
          body: {
            draft: Array(20).fill({ draftProperty: 123 }),
            live: [{ liveProperty: 123 }]
          }
        })
        .mockResolvedValueOnce({
          response: {},
          body: {
            draft: Array(5).fill({ draftProperty: 123 }),
            live: [{ liveProperty: 123 }]
          }
        })

      await collectManagerOverviewMetrics(mockSession)
      expect(saveFormOverviewMetrics).toHaveBeenCalledTimes(27)
    })
  })

  describe('collectTimelineMetrics', () => {
    it('should save each metric', async () => {
      jest.mocked(getJson).mockResolvedValueOnce({
        response: {},
        body: {
          timeline: [{ timelineProperty1: 123 }, { timelineProperty2: 456 }]
        }
      })

      await collectTimelineMetrics(
        'http://localhost/base-url',
        new Date(),
        mockSession
      )
      expect(saveFormTimelineMetrics).toHaveBeenCalledTimes(2)
    })
  })

  describe('updateMetricTotal', () => {
    /** @type {FormTimelineMetric} */
    const metric = {
      type: FormMetricType.TimelineMetric,
      formId: 'form-id',
      formStatus: FormStatus.Draft,
      // @ts-expect-error - example metric name not in enum
      metricName: 'metricName',
      metricValue: 5,
      createdAt: new Date()
    }

    it('should ignore if no period', () => {
      const period = undefined
      const expectedPeriod = undefined
      updateMetricTotal(metric, period)
      expect(period).toEqual(expectedPeriod)
    })

    it('should set initial count for metric name if not yet set', () => {
      const period = { unknown: { count: 2 } }
      const expectedPeriod = { metricName: { count: 5 }, unknown: { count: 2 } }
      updateMetricTotal(metric, period)
      expect(period).toEqual(expectedPeriod)
    })

    it('should add total for metric name', () => {
      const period = { metricName: { count: 3 } }
      const expectedPeriod = { metricName: { count: 8 } } // 3 + inital metric value of 5
      updateMetricTotal(metric, period)
      expect(period).toEqual(expectedPeriod)
    })
  })

  describe('recalcMetricTotals', () => {
    it('should apportion timeline metrics into appropriate time windows', async () => {
      const timelineMetrics = /** @type {FormTimelineMetric[]} */ ([
        {
          type: FormMetricType.TimelineMetric,
          formId: 'form-id',
          formStatus: FormStatus.Draft,
          metricName: FormMetricName.Submissions,
          metricValue: 1,
          createdAt: new Date('2025-12-28')
        },
        {
          type: FormMetricType.TimelineMetric,
          formId: 'form-id',
          formStatus: FormStatus.Live,
          metricName: FormMetricName.Submissions,
          metricValue: 6,
          createdAt: new Date('2025-12-29')
        },
        {
          type: FormMetricType.TimelineMetric,
          formId: 'form-id',
          formStatus: FormStatus.Live,
          metricName: FormMetricName.Submissions,
          metricValue: 1,
          createdAt: new Date('2025-11-20')
        },
        {
          type: FormMetricType.TimelineMetric,
          formId: 'form-id',
          formStatus: FormStatus.Draft,
          metricName: FormMetricName.Submissions,
          metricValue: 2,
          createdAt: new Date('2025-11-02')
        },
        // Within last 7 days
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2025-12-27',
          1
        ),
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2025-12-28',
          3
        ),
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2025-12-29',
          2
        ),
        // Previous 7 days i.e. days 7 - 14 ago
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2025-12-20',
          7
        ),
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2025-12-21',
          2
        ),
        // Prev 30 days
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2025-11-15',
          1
        ),
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2025-11-25',
          3
        ),
        // Previous year
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2024-04-20',
          1,
          'form-id-1'
        ),
        createTimelineMetric(
          FormMetricName.TimeToPublish,
          FormStatus.Live,
          '2024-05-03',
          14,
          'form-id-1'
        ),
        createTimelineMetric(
          FormMetricName.FormsRePublished,
          FormStatus.Live,
          '2024-05-03',
          1,
          'form-id-1'
        ),
        // A re-publish of the form
        createTimelineMetric(
          FormMetricName.FormsFirstPublished,
          FormStatus.Live,
          '2024-05-05',
          1,
          'form-id-1'
        )
      ])
      const mockAsyncIterator = {
        [Symbol.asyncIterator]: function* () {
          for (const metric of timelineMetrics) {
            yield metric
          }
        }
      }

      // @ts-expect-error - resolves to an async iterator like FindCursor<FormSubmissionDocument>
      jest.mocked(getAllTimelineMetrics).mockReturnValueOnce(mockAsyncIterator)

      const totals = await recalcMetrics(new Date('2026-01-01'), mockSession)

      expect(totals.last7Days?.NewFormsCreated.details).toHaveLength(3)
      expect(totals.last7Days?.Submissions.details).toHaveLength(1)
      // Remove 'details' attributes for comparison
      delete totals.last7Days?.NewFormsCreated.details
      delete totals.last7Days?.Submissions.details
      expect(totals.last7Days).toEqual({
        NewFormsCreated: {
          count: 6
        },
        Submissions: {
          count: 6
        }
      })
      expect(totals.prev7Days?.NewFormsCreated.details).toHaveLength(2)
      // Remove 'details' attributes for comparison
      delete totals.prev7Days?.NewFormsCreated.details
      expect(totals.prev7Days).toEqual({
        NewFormsCreated: {
          count: 9
        }
      })
      expect(totals.last30Days?.NewFormsCreated.details).toHaveLength(5)
      expect(totals.last30Days?.Submissions.details).toHaveLength(1)
      // Remove 'details' attributes for comparison
      delete totals.last30Days?.NewFormsCreated.details
      delete totals.last30Days?.Submissions.details
      expect(totals.last30Days).toEqual({
        NewFormsCreated: {
          count: 15
        },
        Submissions: {
          count: 6
        }
      })
      expect(totals.prev30Days?.NewFormsCreated.details).toHaveLength(2)
      expect(totals.prev30Days?.Submissions.details).toHaveLength(1)
      // Remove 'details' attributes for comparison
      delete totals.prev30Days?.NewFormsCreated.details
      delete totals.prev30Days?.Submissions.details
      expect(totals.prev30Days).toEqual({
        NewFormsCreated: {
          count: 4
        },
        Submissions: {
          count: 1
        }
      })
      expect(totals.lastYear?.NewFormsCreated.details).toHaveLength(7)
      expect(totals.lastYear?.Submissions.details).toHaveLength(2)
      // Remove 'details' attributes for comparison
      delete totals.lastYear?.NewFormsCreated.details
      delete totals.lastYear?.Submissions.details
      expect(totals.lastYear).toEqual({
        NewFormsCreated: {
          count: 19
        },
        Submissions: {
          count: 7
        }
      })
      expect(totals.prevYear?.NewFormsCreated.details).toHaveLength(1)
      expect(totals.prevYear?.FormsFirstPublished.details).toHaveLength(1)
      expect(totals.prevYear?.FormsRePublished.details).toHaveLength(1)
      // Remove 'details' attributes for comparison
      delete totals.prevYear?.NewFormsCreated.details
      delete totals.prevYear?.FormsFirstPublished.details
      delete totals.prevYear?.FormsRePublished.details
      expect(totals.prevYear).toEqual({
        FormsFirstPublished: {
          count: 1
        },
        FormsRePublished: {
          count: 1
        },
        NewFormsCreated: {
          count: 1
        },
        TimeToPublish: {
          count: 14
        }
      })
      expect(totals.allTime?.NewFormsCreated.details).toHaveLength(8)
      expect(totals.allTime?.FormsFirstPublished.details).toHaveLength(1)
      expect(totals.allTime?.FormsRePublished.details).toHaveLength(1)
      expect(totals.allTime?.Submissions.details).toHaveLength(2)
      // Remove 'details' attributes for comparison
      delete totals.allTime?.NewFormsCreated.details
      delete totals.allTime?.FormsFirstPublished.details
      delete totals.allTime?.FormsRePublished.details
      delete totals.allTime?.Submissions.details
      expect(totals.allTime).toEqual({
        Submissions: {
          count: 7
        },
        FormsFirstPublished: {
          count: 1
        },
        FormsRePublished: {
          count: 1
        },
        NewFormsCreated: {
          count: 20
        },
        TimeToPublish: {
          count: 14
        }
      })
      expect(totals.draftSubmissions).toEqual({
        'form-id': 3
      })
      expect(totals.liveSubmissions).toEqual({
        'form-id': 7
      })
      expect(totals.republished).toEqual({
        'form-id-1': 1
      })
      expect(totals.daysToPublish).toEqual({
        'form-id-1': 14
      })
    })
  })

  describe('collectTimelineMetricsFromAudit', () => {
    it('should save each metric', async () => {
      const testDate = new Date('2026-05-01')

      jest.mocked(getNumberOfFormsInDraft).mockResolvedValueOnce(17)
      jest
        .mocked(getAuditRecordsOfType)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstCreated)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstPublished)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorRePublished)

      jest
        .mocked(isFirstPublish)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
      jest
        .mocked(getFirstDraft)
        // @ts-expect-error - partial mock of record
        .mockResolvedValue({ createdAt: new Date('2026-03-30') })

      await collectTimelineMetricsFromAudit(testDate, mockSession)
      expect(saveFormTimelineMetrics).toHaveBeenCalledTimes(4)
      expect(saveFormTimelineMetrics).toHaveBeenNthCalledWith(
        1,
        'form-id-1a',
        {
          createdAt: new Date('2026-03-30T00:00:00.000Z'),
          formStatus: 'draft',
          metricName: 'NewFormsCreated',
          metricValue: 1
        },
        expect.anything()
      )
      expect(saveFormTimelineMetrics).toHaveBeenNthCalledWith(
        2,
        'form-id-1a',
        {
          createdAt: new Date('2026-04-08T00:00:00.000Z'),
          formStatus: 'live',
          metricName: 'FormsFirstPublished',
          metricValue: 1
        },
        expect.anything()
      )
      expect(saveFormTimelineMetrics).toHaveBeenNthCalledWith(
        3,
        'form-id-1a',
        {
          createdAt: new Date('2026-04-08T00:00:00.000Z'),
          formStatus: 'live',
          metricName: 'TimeToPublish',
          metricValue: 9
        },
        expect.anything()
      )
      expect(saveFormTimelineMetrics).toHaveBeenNthCalledWith(
        4,
        'n/a',
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          formStatus: 'draft',
          metricName: 'FormsInDraft',
          metricValue: 17
        },
        expect.anything()
      )
    })
  })

  describe('setMetricTotal', () => {
    it('should ignore if no period', () => {
      const period = undefined
      // @ts-expect-error - partial mock of metric
      setMetricTotal({ metricName: 'metric-name' }, period)
      expect(period).toBeUndefined()
    })

    it('should set count in period', () => {
      const period = {}
      // @ts-expect-error - partial mock of metric
      setMetricTotal({ metricName: 'metricName', metricValue: 7 }, period)
      expect(period).toEqual({ metricName: { count: 7 } })
    })
  })

  describe('updateMetricAverage', () => {
    it('should ignore if no period', () => {
      const period = undefined
      // @ts-expect-error - partial mock of metric
      updateMetricAverage({ metricName: 'metric-name' }, period)
      expect(period).toBeUndefined()
    })

    it('should set count in period when not initialised', () => {
      const metric = { metricName: 'myMetric', metricValue: 25 }
      const period = {}
      // @ts-expect-error - partial mock of metric
      updateMetricAverage(metric, period)
      expect(period).toEqual({ myMetric: { avgCount: 1, avgTotal: 25 } })
    })

    it('should continue count in period if exists', () => {
      const metric = { metricName: 'myMetric', metricValue: 25 }
      const period = { myMetric: { avgCount: 1, avgTotal: 100 } }
      // @ts-expect-error - partial mock of metric
      updateMetricAverage(metric, period)
      expect(period).toEqual({ myMetric: { avgCount: 2, avgTotal: 125 } })
    })
  })

  describe('generateReport', () => {
    it('should generate report', async () => {
      const mockNewSession = /** @type {any} */ ({
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)

      const overviewMetrics = /** @type {WithId<FormOverviewMetric>[]} */ ([
        {
          _id: new ObjectId('69fb0727de574045cd8c0b0e'),
          type: FormMetricType.OverviewMetric,
          formId: 'form-id-1',
          formStatus: FormStatus.Live,
          summaryMetrics: {
            name: 'Form 1'
          },
          featureMetrics: {},
          submissionsCount: 5,
          updatedAt: new Date('2026-02-02')
        }
      ])
      jest.mocked(getAllOverviewMetrics).mockReturnValueOnce({
        // @ts-expect-error - partial data mock
        toArray: () => overviewMetrics
      })
      // @ts-expect-error - partial data mock
      jest.mocked(getMetricTotals).mockResolvedValueOnce([])
      const res = await generateReport({})
      expect(res).toEqual({
        overview: [
          {
            formId: 'form-id-1',
            formName: 'Form 1',
            formStatus: 'live',
            submissionsCount: 0,
            summaryMetrics: {
              name: 'Form 1',
              daysToPublish: 0,
              republished: 0
            },
            featureMetrics: {}
          }
        ],
        totals: []
      })
    })

    it('should generate report using filter criteria', async () => {
      const mockNewSession = /** @type {any} */ ({
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)

      const overviewMetrics = /** @type {WithId<FormOverviewMetric>[]} */ ([
        {
          _id: new ObjectId('69fb0727de574045cd8c0b0e'),
          type: FormMetricType.OverviewMetric,
          formId: 'form-id-1',
          formStatus: FormStatus.Live,
          summaryMetrics: {
            name: 'Form 1'
          },
          featureMetrics: {},
          submissionsCount: 5,
          updatedAt: new Date('2026-02-02')
        }
      ])
      jest.mocked(getAllOverviewMetrics).mockReturnValueOnce({
        // @ts-expect-error - partial data mock
        toArray: () => overviewMetrics
      })
      // @ts-expect-error - partial data mock
      jest.mocked(getMetricTotals).mockResolvedValueOnce([])
      await generateReport({ searchText: 'abc def', org: ['org 1'] })
      expect(getAllOverviewMetrics).toHaveBeenCalledWith(
        {
          org: ['org 1'],
          searchText: 'abc def'
        },
        expect.anything()
      )
    })
  })

  describe('applyExtraColumns', () => {
    it('should apply submission counts and others to do with publishing', () => {
      const metrics = {
        totals: {
          liveSubmissions: {
            'form-id-1': 5,
            'form-id-2': 7
          },
          draftSubmissions: {
            'form-id-1': 6,
            'form-id-2': 9
          },
          daysToPublish: {
            'form-id-1': 15
          },
          republished: {
            'form-id-1': 2
          }
        },
        overview: [
          {
            formId: 'form-id-1',
            formStatus: FormStatus.Live,
            summaryMetrics: {
              name: 'Form 1'
            }
          },
          {
            formId: 'form-id-2',
            formStatus: FormStatus.Draft,
            summaryMetrics: {
              name: 'Form 2'
            }
          }
        ]
      }
      // @ts-expect-error - partial data mock
      const res = applyExtraColumns(metrics)
      expect(res).toEqual([
        {
          formId: 'form-id-1',
          formName: 'Form 1',
          formStatus: 'live',
          submissionsCount: 5,
          summaryMetrics: {
            daysToPublish: 15,
            republished: 2,
            name: 'Form 1'
          },
          featureMetrics: undefined
        },
        {
          formId: 'form-id-2',
          formName: 'Form 2',
          formStatus: 'draft',
          submissionsCount: 9,
          summaryMetrics: {
            daysToPublish: undefined,
            republished: undefined,
            name: 'Form 2'
          },
          featureMetrics: undefined
        }
      ])
    })
  })

  describe('clearMetricsDatabase', () => {
    it('should clear db', async () => {
      jest.mocked(clearMetricsData).mockResolvedValueOnce()
      const mockNewSession = /** @type {any} */ ({
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback()
        }),
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)
      await clearMetricsDatabase()
      expect(clearMetricsData).toHaveBeenCalled()
    })
  })

  describe('collectMetrics', () => {
    it('should skip if reporting is up-to-date', async () => {
      const lastRunDate = new Date('2026-03-09T04:00:00.000Z')
      const currentRunDate = new Date('2026-03-10T03:00:00.000Z')
      const res = await collectMetrics(
        currentRunDate,
        lastRunDate,
        30,
        mockSession
      )
      expect(res).toEqual({
        success: false,
        message: 'Skipped',
        endDate: undefined,
        processMoreBatches: false
      })
    })

    it('should skip if reporting is ahead', async () => {
      const lastRunDate = new Date('2026-03-11T04:00:00.000Z')
      const currentRunDate = new Date('2026-03-10T03:00:00.000Z')
      const res = await collectMetrics(
        currentRunDate,
        lastRunDate,
        30,
        mockSession
      )
      expect(res).toEqual({
        success: false,
        message: 'Skipped',
        endDate: undefined,
        processMoreBatches: false
      })
    })

    it('should skip if reporting is ahead only by a minute', async () => {
      const lastRunDate = new Date('2026-03-10T03:01:00.000Z')
      const currentRunDate = new Date('2026-03-10T03:00:00.000Z')
      const res = await collectMetrics(
        currentRunDate,
        lastRunDate,
        30,
        mockSession
      )
      expect(res).toEqual({
        success: false,
        message: 'Skipped',
        endDate: undefined,
        processMoreBatches: false
      })
    })

    it('should run for single day of processing', async () => {
      const lastRunDate = new Date('2026-05-11T15:56:04.364Z')
      const currentRunDate = new Date('2026-05-13T03:00:00.000Z')

      const mockNewSession = /** @type {any} */ ({
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback()
        }),
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)
      jest
        .mocked(getJson)
        .mockResolvedValueOnce({
          response: {},
          body: ['form-id-1', 'form-id-2']
        })
        .mockResolvedValueOnce({ response: {}, body: { draft: {}, live: {} } })
        .mockResolvedValueOnce({ response: {}, body: { timeline: [] } })

      jest
        .mocked(getAuditRecordsOfType)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstCreated)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorDraftCreatedFromLive)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstPublished)

      const blankSet = /** @type {AuditRecordInput[]} */ ([])
      const mockAsyncIteratorBlankSet = {
        [Symbol.asyncIterator]: function* () {
          for (const metric of blankSet) {
            yield metric
          }
        }
      }

      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorBlankSet)

      const res = await collectMetrics(
        currentRunDate,
        lastRunDate,
        30,
        mockSession
      )
      expect(res).toEqual({
        success: true,
        message: 'Completed ok',
        endDate: new Date('2026-05-12T03:00:00.000Z'),
        processMoreBatches: false
      })
      expect(getJson).toHaveBeenCalledTimes(3)
      const calls = jest.mocked(getJson).mock.calls
      expect(calls[0][0].href).toBe('http://localhost:3001/all-form-ids')
      expect(calls[1][0].href).toBe(
        'http://localhost:3001/report/overview?ids=form-id-1&ids=form-id-2'
      )
      expect(calls[2][0].href).toBe(
        'http://localhost:3002/report/timeline?date=2026-05-12T15:56:04.364Z'
      )
    })

    it('should loop if multiple days to report', async () => {
      const lastRunDate = new Date('2026-03-06T04:00:00.000Z')
      const currentRunDate = new Date('2026-03-10T03:00:00.000Z')

      const mockNewSession = /** @type {any} */ ({
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback()
        }),
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)
      jest
        .mocked(getJson)
        .mockResolvedValueOnce({
          response: {},
          body: ['form-id-1', 'form-id-2']
        })
        .mockResolvedValueOnce({ response: {}, body: { draft: {}, live: {} } })
        .mockResolvedValueOnce({ response: {}, body: { timeline: [] } })
        .mockResolvedValueOnce({ response: {}, body: { timeline: [] } })
        .mockResolvedValueOnce({ response: {}, body: { timeline: [] } })
        .mockResolvedValueOnce({ response: {}, body: { timeline: [] } })

      jest
        .mocked(getAuditRecordsOfType)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstCreated)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorDraftCreatedFromLive)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstPublished)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstCreated)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorDraftCreatedFromLive)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstPublished)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstCreated)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorDraftCreatedFromLive)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstPublished)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstCreated)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorDraftCreatedFromLive)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstPublished)

      const blankSet = /** @type {AuditRecordInput[]} */ ([])
      const mockAsyncIteratorBlankSet = {
        [Symbol.asyncIterator]: function* () {
          for (const metric of blankSet) {
            yield metric
          }
        }
      }

      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorBlankSet)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorBlankSet)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorBlankSet)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorBlankSet)

      const res = await collectMetrics(
        currentRunDate,
        lastRunDate,
        30,
        mockSession
      )

      expect(res).toEqual({
        success: true,
        message: 'Completed ok',
        endDate: new Date('2026-03-09T03:00:00.000Z'),
        processMoreBatches: false
      })
      expect(getJson).toHaveBeenCalledTimes(5)
      const calls = jest.mocked(getJson).mock.calls
      expect(calls[0][0].href).toBe('http://localhost:3001/all-form-ids')
      expect(calls[1][0].href).toBe(
        'http://localhost:3001/report/overview?ids=form-id-1&ids=form-id-2'
      )
      expect(calls[2][0].href).toBe(
        'http://localhost:3002/report/timeline?date=2026-03-07T04:00:00.000Z'
      )
      expect(calls[3][0].href).toBe(
        'http://localhost:3002/report/timeline?date=2026-03-08T04:00:00.000Z'
      )
      expect(calls[4][0].href).toBe(
        'http://localhost:3002/report/timeline?date=2026-03-09T04:00:00.000Z'
      )
    })
  })

  describe('getAllFormIds', () => {
    it('should call correct URL', async () => {
      jest
        .mocked(getJson)
        .mockResolvedValueOnce({ body: ['id1', 'id2'], response: {} })
      const res = await getAllFormIds()
      expect(res).toEqual(['id1', 'id2'])
      expect(getJson).toHaveBeenCalledWith(
        new URL('http://localhost:3001/all-form-ids'),
        {}
      )
    })
  })

  describe('getOverviewMetricsForForms', () => {
    it('should call correct URL with correct query params', async () => {
      jest
        .mocked(getJson)
        .mockResolvedValueOnce({ body: ['res1'], response: {} })
      const res = await getOverviewMetricsForForms(['id1', 'id2', 'id3'])
      expect(res).toEqual(['res1'])
      expect(getJson).toHaveBeenCalledWith(
        new URL(
          'http://localhost:3001/report/overview?ids=id1&ids=id2&ids=id3'
        ),
        {}
      )
    })
  })

  describe('generateReportForForm', () => {
    it('should generate metrics for a single form', async () => {
      const mockNewSession = /** @type {any} */ ({
        endSession: jest.fn().mockResolvedValue(undefined)
      })
      jest.mocked(client.startSession).mockReturnValue(mockNewSession)

      const timelineSet = [
        createTimelineMetric(
          FormMetricName.NewFormsCreated,
          FormStatus.Draft,
          '2024-04-20',
          1,
          'form-id-1'
        )
      ]

      const mockAsyncIteratorTimelineSet = {
        [Symbol.asyncIterator]: function* () {
          for (const metric of timelineSet) {
            yield metric
          }
        }
      }
      jest
        .mocked(getAllTimelineMetrics)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorTimelineSet)
      jest
        .mocked(getFormTimelineMetricsCursor)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorTimelineSet)
      jest.mocked(getMetricTotals).mockResolvedValueOnce(
        // @ts-expect-error - partial mock of data
        {
          earliestDate: new Date('2026-01-01'),
          updatedAt: new Date('2026-05-01')
        }
      )

      const res = await generateReportForForm('form-id-1')
      expect(res).toEqual({
        totals: {
          last7Days: {},
          prev7Days: {},
          last30Days: {},
          prev30Days: {},
          lastYear: {},
          prevYear: {},
          allTime: {
            [FormMetricName.NewFormsCreated]: {
              count: 1,
              details: [
                {
                  createdAt: new Date('2024-04-20T00:00:00.000Z'),
                  formId: 'form-id-1',
                  metricValue: 1
                }
              ]
            }
          },
          liveSubmissions: {},
          draftSubmissions: {},
          daysToPublish: {},
          republished: {},
          earliestDate: new Date('2026-01-01'),
          updatedAt: new Date('2026-05-01')
        }
      })
    })
  })
})

/**
 * @import { WithId } from 'mongodb'
 * @import { AuditRecordInput, FormOverviewMetric, FormTimelineMetric } from '@defra/forms-model'
 */
