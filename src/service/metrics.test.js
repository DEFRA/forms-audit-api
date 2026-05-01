import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'
import { startOfDay, sub } from 'date-fns'

import { getJson } from '~/src/lib/fetch.js'
import { client } from '~/src/mongo.js'
import { getAuditRecordsOfType } from '~/src/repositories/audit-record-repository.js'
import {
  getAllTimelineMetrics,
  getFirstDraft,
  getNumberOfFormsInDraft,
  grabLock,
  isFirstPublish,
  releaseLock,
  saveFormOverviewMetrics,
  saveFormTimelineMetrics
} from '~/src/repositories/metrics-repository.js'
import {
  collectManagerOverviewMetrics,
  collectTimelineMetrics,
  collectTimelineMetricsFromAudit,
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
 * @param {string} metricName
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
    const yesterday = startOfDay(sub(now, { days: 1 }))
    jest.mocked(grabLock).mockResolvedValueOnce({
      lockSuccess: true,
      lastSuccessfulRun: yesterday
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
    expect(getJson).toHaveBeenCalledTimes(2)
    expect(getJson).toHaveBeenNthCalledWith(
      1,
      new URL(
        'http://localhost:3001/report/overview?date=' + now.toISOString()
      ),
      {}
    )
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      new URL(
        'http://localhost:3002/report/timeline?date=' + yesterday.toISOString()
      ),
      {}
    )
  })

  it('should log error if job fails', async () => {
    const yesterday = startOfDay(sub(now, { days: 1 }))
    jest.mocked(grabLock).mockResolvedValueOnce({
      lockSuccess: true,
      lastSuccessfulRun: yesterday
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
      false,
      'API JSON error',
      expect.anything()
    )
  })

  describe('collectManagerOverviewMetrics', () => {
    it('should save each metric', async () => {
      jest.mocked(getJson).mockResolvedValueOnce({
        response: {},
        body: {
          draft: [{ draftProperty: 123 }],
          live: [{ liveProperty: 123 }]
        }
      })

      await collectManagerOverviewMetrics(new Date(), mockSession)
      expect(saveFormOverviewMetrics).toHaveBeenCalledTimes(2)
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
          FormMetricName.FormsPublished,
          FormStatus.Live,
          '2024-05-03',
          1,
          'form-id-1'
        ),
        // A re-publish of the form
        createTimelineMetric(
          FormMetricName.FormsPublished,
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

      expect(totals).toEqual({
        last7Days: {
          NewFormsCreated: {
            count: 6
          },
          Submissions: {
            count: 6
          }
        },
        prev7Days: {
          NewFormsCreated: {
            count: 9
          }
        },
        last30Days: {
          NewFormsCreated: {
            count: 15
          },
          Submissions: {
            count: 6
          }
        },
        prev30Days: {
          NewFormsCreated: {
            count: 4
          },
          Submissions: {
            count: 1
          }
        },
        lastYear: {
          NewFormsCreated: {
            count: 19
          },
          Submissions: {
            count: 7
          }
        },
        prevYear: {
          FormsPublished: {
            count: 2
          },
          NewFormsCreated: {
            count: 1
          },
          TimeToPublish: {
            count: '14.0'
          }
        },
        allTime: {
          Submissions: {
            count: 7
          },
          FormsPublished: {
            count: 2
          },
          NewFormsCreated: {
            count: 20
          },
          TimeToPublish: {
            count: '14.0'
          }
        },
        draftSubmissions: {
          'form-id': 3
        },
        liveSubmissions: {
          'form-id': 7
        },
        republished: {
          'form-id-1': 1
        },
        daysToPublish: {
          'form-id-1': 14
        }
      })
    })
  })

  describe('collectTimelineMetricsFromAudit', () => {
    it('should save each metric', async () => {
      const testDate = new Date('2026-04-01')

      jest.mocked(getNumberOfFormsInDraft).mockResolvedValueOnce(17)
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
          type: 'FORM_DRAFT_CREATED_FROM_LIVE',
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

      jest
        .mocked(getAuditRecordsOfType)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstCreated)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorDraftCreatedFromLive)
        // @ts-expect-error - resolves to an async iterator like FindCursor<AuditRecordInput>
        .mockReturnValueOnce(mockAsyncIteratorFirstPublished)

      jest.mocked(isFirstPublish).mockResolvedValue(true)
      // @ts-expect-error - partial mock of record
      jest
        .mocked(getFirstDraft)
        .mockResolvedValue({ createdAt: new Date('2026-03-30') })

      await collectTimelineMetricsFromAudit(testDate, mockSession)
      expect(saveFormTimelineMetrics).toHaveBeenCalledTimes(5)
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
          createdAt: new Date('2026-03-30T00:00:00.000Z'),
          formStatus: 'draft',
          metricName: 'NewFormsCreated',
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
          metricName: 'FormsPublished',
          metricValue: 1
        },
        expect.anything()
      )
      expect(saveFormTimelineMetrics).toHaveBeenNthCalledWith(
        4,
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
        5,
        'n/a',
        {
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
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
})

/**
 * @import { AuditRecordInput, FormTimelineMetric } from '@defra/forms-model'
 */
