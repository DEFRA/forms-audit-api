import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'

import { METRICS_COLLECTION_NAME, client, db } from '~/src/mongo.js'
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
      // Submission metrics arrive via JSON so 'createdAt' is a string
      timelineMetric('before-string', '2025-08-04T03:00:00.000Z'),
      timelineMetric('same-day-string', '2025-08-05T03:00:00.000Z'),
      timelineMetric('after-string', '2025-08-06T03:00:00.000Z'),
      // Audit-derived metrics have a BSON date
      timelineMetric(
        'same-day-late-date',
        new Date('2025-08-05T23:59:59.999Z')
      ),
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
      'before-string',
      'same-day-late-date',
      'same-day-string'
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
})
