import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'

import {
  METRICS_COLLECTION_NAME,
  client,
  convertMetricsCreatedAtToDate,
  db
} from '~/src/mongo.js'
import { clearMetricsData } from '~/src/repositories/metrics-job-repository.js'
import { setupIntegrationDb } from '~/test/helpers/mongo-memory.js'

jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}))

setupIntegrationDb()

/**
 * @param {string} formId
 * @param { Date | string } createdAt
 */
function timelineMetric(formId, createdAt) {
  return {
    type: FormMetricType.TimelineMetric,
    formId,
    formStatus: FormStatus.Live,
    metricName: FormMetricName.Submissions,
    metricValue: 1,
    createdAt
  }
}

describe('metrics-job-repository (integration)', () => {
  const coll = () => db.collection(METRICS_COLLECTION_NAME)

  beforeEach(async () => {
    await coll().deleteMany({})
    await coll().insertMany([
      {
        type: 'form-metric-control',
        locked: false,
        lastSuccessfulRunDate: new Date('2026-11-26T03:00:00.000Z')
      },
      timelineMetric('before', new Date('2025-08-04T03:00:00.000Z')),
      timelineMetric('same-day', new Date('2025-08-05T03:00:00.000Z')),
      timelineMetric(
        'same-day-late-date',
        new Date('2025-08-05T23:59:59.999Z')
      ),
      timelineMetric('after', new Date('2025-08-06T03:00:00.000Z')),
      timelineMetric('after-date', new Date('2025-08-06T00:00:00.000Z')),
      { type: FormMetricType.TotalsMetric, earliestDate: new Date() },
      { type: FormMetricType.OverviewMetric, formId: 'overview' }
    ])
  })

  it('should retain timeline metrics up to and including the last retained day', async () => {
    const lastRetainedDate = new Date('2025-08-05T03:00:00.000Z')
    const session = client.startSession()
    try {
      await session.withTransaction(async () => {
        await clearMetricsData(session, lastRetainedDate)
      })
    } finally {
      await session.endSession()
    }

    const remaining = await coll()
      .find({ type: { $ne: 'form-metric-control' } })
      .toArray()
    expect(remaining.map((r) => r.formId).sort()).toEqual([
      'before',
      'same-day',
      'same-day-late-date'
    ])

    const control = await coll().findOne({ type: 'form-metric-control' })
    expect(control?.lastSuccessfulRunDate).toEqual(lastRetainedDate)
  })

  it('should clear all metrics when no date is retained', async () => {
    const session = client.startSession()
    try {
      await session.withTransaction(async () => {
        await clearMetricsData(session)
      })
    } finally {
      await session.endSession()
    }

    const remaining = await coll().find({}).toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toMatchObject({
      type: 'form-metric-control',
      lastSuccessfulRunDate: null
    })
  })

  describe('convertMetricsCreatedAtToDate', () => {
    it('should convert string createdAt values to dates', async () => {
      await coll().insertMany([
        // Submission metrics previously stored 'createdAt' as received via JSON
        timelineMetric('string-1', '2025-08-07T03:00:00.000Z'),
        timelineMetric('string-2', '2025-08-08T03:00:00.000Z')
      ])
      const logger = { info: jest.fn() }

      // @ts-expect-error - partial logger
      await convertMetricsCreatedAtToDate(coll(), logger)

      expect(
        await coll().countDocuments({ createdAt: { $type: 'string' } })
      ).toBe(0)
      const converted = await coll().findOne({ formId: 'string-1' })
      expect(converted?.createdAt).toEqual(new Date('2025-08-07T03:00:00.000Z'))
      // Existing dates untouched
      const existing = await coll().findOne({ formId: 'same-day' })
      expect(existing?.createdAt).toEqual(new Date('2025-08-05T03:00:00.000Z'))
      expect(logger.info).toHaveBeenCalledWith(
        'Converted createdAt from string to date on 2 metrics records'
      )

      // Idempotent - nothing further to convert
      logger.info.mockClear()
      // @ts-expect-error - partial logger
      await convertMetricsCreatedAtToDate(coll(), logger)
      expect(logger.info).not.toHaveBeenCalled()
    })
  })
})
