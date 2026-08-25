import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'

import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import { db } from '~/src/mongo.js'
import { generateSubmissionsReport } from '~/src/service/metrics-submissions.js'

const mockCollection = buildMockCollection()

jest.mock('~/src/mongo.js', () => {
  const collection = /** @satisfies {Collection<FormTimelineMetric>} */ jest
    .fn()
    .mockImplementation(() => mockCollection)
  return {
    db: {
      collection
    },
    get client() {
      return {
        startSession: () => ({
          endSession: jest.fn().mockResolvedValue(undefined),
          withTransaction: jest.fn(
            /**
             * Mock transaction handler
             * @param {() => Promise<void>} fn
             */
            async (fn) => fn()
          )
        })
      }
    }
  }
})

describe('metrics-submissions', () => {
  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(mockCollection)
    jest.useFakeTimers().setSystemTime(new Date('2026-04-02'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should return submissions metrics by month per form', async () => {
    const timelineMetrics = /** @type {FormTimelineMetric[]} */ ([
      {
        type: FormMetricType.TimelineMetric,
        formId: 'form-id-1',
        formStatus: FormStatus.Live,
        metricName: FormMetricName.Submissions,
        metricValue: 5,
        createdAt: new Date('2025-12-10T10:00:00.000Z')
      },
      {
        type: FormMetricType.TimelineMetric,
        formId: 'form-id-1',
        formStatus: FormStatus.Live,
        metricName: FormMetricName.Submissions,
        metricValue: 1,
        createdAt: new Date('2026-01-01T10:00:00.000Z')
      },
      {
        type: FormMetricType.TimelineMetric,
        formId: 'form-id-2',
        formStatus: FormStatus.Live,
        metricName: FormMetricName.Submissions,
        metricValue: 6,
        createdAt: new Date('2025-12-29T10:00:00.000Z')
      },
      {
        type: FormMetricType.TimelineMetric,
        formId: 'form-id-2',
        formStatus: FormStatus.Live,
        metricName: FormMetricName.Submissions,
        metricValue: 4,
        createdAt: new Date('2025-12-30T10:00:00.000Z')
      }
    ])
    const mockAsyncIterator = {
      [Symbol.asyncIterator]: function* () {
        for (const metric of timelineMetrics) {
          yield metric
        }
      }
    }
    mockCollection.find
      .mockReturnValueOnce({
        sort: jest.fn(() => mockAsyncIterator)
      })
      .mockReturnValueOnce({
        sort: jest.fn(() => mockAsyncIterator)
      })

    // Ensure months wrap around time-change months correctly
    const res = await generateSubmissionsReport(new Date(2025, 1, 1)) // 01/02/2025
    expect(res).toEqual({
      '2025-02': {},
      '2025-03': {},
      '2025-04': {},
      '2025-05': {},
      '2025-06': {},
      '2025-07': {},
      '2025-08': {},
      '2025-09': {},
      '2025-10': {},
      '2025-11': {},
      '2025-12': {
        'form-id-1': 5,
        'form-id-2': 10
      },
      '2026-01': {
        'form-id-1': 1
      },
      '2026-02': {},
      '2026-03': {},
      '2026-04': {}
    })

    // Ensure start month in time-change month handles correctly
    const res2 = await generateSubmissionsReport(new Date(2025, 9, 1)) // 01/10/2025
    expect(res2).toEqual({
      '2025-10': {},
      '2025-11': {},
      '2025-12': {
        'form-id-1': 5,
        'form-id-2': 10
      },
      '2026-01': {
        'form-id-1': 1
      },
      '2026-02': {},
      '2026-03': {},
      '2026-04': {}
    })
  })

  it('should prevent endlees loop if future date supplied by accident', async () => {
    const timelineMetrics = /** @type {FormTimelineMetric[]} */ ([
      {
        type: FormMetricType.TimelineMetric,
        formId: 'form-id-1',
        formStatus: FormStatus.Live,
        metricName: FormMetricName.Submissions,
        metricValue: 5,
        createdAt: new Date('2025-12-10T10:00:00.000Z')
      }
    ])
    const mockAsyncIterator = {
      [Symbol.asyncIterator]: function* () {
        for (const metric of timelineMetrics) {
          yield metric
        }
      }
    }
    mockCollection.find
      .mockReturnValueOnce({
        sort: jest.fn(() => mockAsyncIterator)
      })
      .mockReturnValueOnce({
        sort: jest.fn(() => mockAsyncIterator)
      })

    // Ensure months wrap around time-change months correctly
    const res = await generateSubmissionsReport(new Date(2028, 1, 1))
    expect(res).toEqual({
      '2028-02': {}
    })
  })
})

/**
 * @import { FormTimelineMetric } from '@defra/forms-model'
 */
