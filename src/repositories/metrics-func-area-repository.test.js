import { FormMetricType } from '@defra/forms-model'

import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import { db } from '~/src/mongo.js'
import { saveFunctionalAreaTimelineMetrics } from '~/src/repositories/metrics-func-area-repository.js'

const mockCollection = buildMockCollection()
const mockSession = {}

jest.mock('~/src/mongo.js', () => ({
  db: {
    collection: jest.fn()
  }
}))

describe('metrics-func-area-repository', () => {
  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  const metricData = {
    metricName: 'SuccessfulAuthentication',
    metricValue: 3,
    createdAt: new Date('2026-05-01T10:00:00.000Z')
  }

  it('saves a functional-area timeline metric', async () => {
    await saveFunctionalAreaTimelineMetrics(
      // @ts-expect-error - partial data mocked
      metricData,
      mockSession
    )

    expect(mockCollection.insertOne).toHaveBeenCalledWith(
      {
        ...metricData,
        type: FormMetricType.TimelineMetric
      },
      { session: mockSession }
    )
  })

  it('rethrows an error when saving fails', async () => {
    const error = new Error('db error')
    mockCollection.insertOne.mockRejectedValueOnce(error)

    await expect(
      saveFunctionalAreaTimelineMetrics(
        // @ts-expect-error - partial data mocked
        metricData,
        mockSession
      )
    ).rejects.toBe(error)
  })
})
