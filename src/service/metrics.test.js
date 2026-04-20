import { startOfDay, sub } from 'date-fns'

import { getJson } from '~/src/lib/fetch.js'
import { client } from '~/src/mongo.js'
import { grabLock, releaseLock } from '~/src/repositories/metrics-repository.js'
import { runMetricsCollectionJob } from '~/src/service/metrics.js'

jest.mock('~/src/lib/fetch.js')
jest.mock('~/src/repositories/metrics-repository.js')

jest.mock('~/src/mongo.js', () => ({
  client: {
    startSession: jest.fn()
  },
  db: {},
  METRICS_COLLECTION_NAME: 'metrics'
}))

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
      lastSuccessfulRun: undefined
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

    await runMetricsCollectionJob()
    expect(getJson).toHaveBeenCalledTimes(3)
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
        'http://localhost:3001/report/timeline?date=' + yesterday.toISOString()
      ),
      {}
    )
    expect(getJson).toHaveBeenNthCalledWith(
      3,
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
})

/**
 * @import { MongoClient } from 'mongodb'
 */
