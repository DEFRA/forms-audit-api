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
    mockCollection.find.mockReturnValueOnce({
      sort: jest.fn(() => mockAsyncIterator)
    })

    const res = await generateSubmissionsReport(new Date(2025, 9, 1))
    expect(res).toEqual({
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
})

/**
 * @import { FormTimelineMetric } from '@defra/forms-model'
 */
