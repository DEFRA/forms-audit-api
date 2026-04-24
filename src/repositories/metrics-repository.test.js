import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'

import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import { db } from '~/src/mongo.js'
import {
  deleteFormOverviewMetrics,
  getFormOverviewMetrics,
  getFormTimelineMetrics,
  grabLock,
  releaseLock,
  saveFormOverviewMetrics,
  saveFormTimelineMetrics,
  updateMetricTotals
} from '~/src/repositories/metrics-repository.js'

const mockCollection = buildMockCollection()

/**
 * @type {any}
 */
const mockSession = {}

jest.mock('~/src/mongo.js', () => {
  let isPrepared = false
  const collection =
    /** @satisfies {Collection<{draft: FormOverviewMetric}>} */ jest
      .fn()
      .mockImplementation(() => mockCollection)
  return {
    db: {
      collection
    },
    get client() {
      if (!isPrepared) {
        return undefined
      }

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
    },

    prepareDb() {
      isPrepared = true
      return Promise.resolve()
    }
  }
})

const formId = '3d29fb0b-c1bd-4ec8-a0d3-4c024347f1ef'

describe('metrics-repository', () => {
  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  const baseOverviewDoc = {
    type: FormMetricType.OverviewMetric,
    formId,
    formStatus: FormStatus.Draft,
    summaryMetrics: {},
    featureCounts: {},
    submissionsCount: 0,
    updatedAt: new Date('2026-02-01T00:00:00.000Z')
  }

  describe('getFormOverviewMetrics', () => {
    const draftDoc = {
      ...baseOverviewDoc
    }
    const liveDoc = {
      ...baseOverviewDoc,
      formStatus: FormStatus.Live,
      updatedAt: new Date('2026-03-05T00:00:00.000Z')
    }
    it('should get draft/live overview metrics for a form', async () => {
      mockCollection.findOne
        .mockResolvedValueOnce(draftDoc)
        .mockResolvedValueOnce(liveDoc)

      const result = await getFormOverviewMetrics(formId, mockSession)

      expect(result).toEqual({
        draft: draftDoc,
        live: liveDoc
      })
    })

    it('should throw if error', async () => {
      mockCollection.findOne.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() =>
        getFormOverviewMetrics(formId, mockSession)
      ).rejects.toThrow('db error')
    })
  })

  describe('deleteFormOverviewMetrics', () => {
    it('should delete docs', async () => {
      mockCollection.deleteMany.mockResolvedValueOnce({})

      await deleteFormOverviewMetrics(mockSession)

      expect(mockCollection.deleteMany).toHaveBeenCalledWith(
        {
          type: 'overview-metric'
        },
        {
          session: {}
        }
      )
    })

    it('should throw if error', async () => {
      mockCollection.deleteMany.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() =>
        deleteFormOverviewMetrics(mockSession)
      ).rejects.toThrow('db error')
    })
  })

  describe('saveFormOverviewMetrics', () => {
    const doc = /** @type {FormOverviewMetric} */ ({
      ...baseOverviewDoc
    })
    it('should save doc', async () => {
      mockCollection.updateOne.mockResolvedValueOnce({})

      await saveFormOverviewMetrics(formId, FormStatus.Draft, doc, mockSession)

      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        {
          featureCounts: {},
          formId: '3d29fb0b-c1bd-4ec8-a0d3-4c024347f1ef',
          formStatus: 'draft',
          submissionsCount: 0,
          summaryMetrics: {},
          type: 'overview-metric',
          updatedAt: new Date('2026-02-01T00:00:00.000Z')
        },
        {
          session: {}
        }
      )
    })

    it('should throw if error', async () => {
      mockCollection.insertOne.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() =>
        saveFormOverviewMetrics(formId, FormStatus.Draft, doc, mockSession)
      ).rejects.toThrow('db error')
    })
  })

  const baseTimelineDoc = {
    type: FormMetricType.TimelineMetric,
    formId,
    formStatus: FormStatus.Draft,
    metricName: 'metric1',
    metricValue: 10,
    createdAt: new Date('2026-02-01T00:00:00.000Z')
  }

  describe('getFormTimelineMetrics', () => {
    const draftDoc = {
      ...baseTimelineDoc
    }
    const liveDoc = {
      ...baseTimelineDoc,
      metricName: 'metric2',
      metricValue: 5,
      formStatus: FormStatus.Live,
      createdAt: new Date('2026-03-05T00:00:00.000Z')
    }
    it('should get draft/live timeline metrics for a form', async () => {
      mockCollection.find.mockReturnValueOnce({
        sort: jest.fn(() => {
          return { toArray: () => [draftDoc, liveDoc] }
        })
      })

      const result = await getFormTimelineMetrics(formId, mockSession)

      expect(result).toEqual([draftDoc, liveDoc])
    })

    it('should throw if error', async () => {
      mockCollection.find.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() =>
        getFormTimelineMetrics(formId, mockSession)
      ).rejects.toThrow('db error')
    })
  })

  describe('saveFormTimelineMetrics', () => {
    const doc = /** @type {FormTimelineMetric} */ ({
      ...baseTimelineDoc
    })
    it('should save doc', async () => {
      mockCollection.insertOne.mockResolvedValueOnce({})

      await saveFormTimelineMetrics(formId, doc, mockSession)

      expect(mockCollection.insertOne).toHaveBeenCalledWith(doc, {
        session: {}
      })
    })

    it('should throw if error', async () => {
      mockCollection.insertOne.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() =>
        saveFormTimelineMetrics(formId, doc, mockSession)
      ).rejects.toThrow('db error')
    })
  })

  describe('updateMetricTotals', () => {
    const totals = {
      submissions: { 'form-id-1': 5 },
      type: FormMetricType.TotalsMetric,
      last7Days: { [FormMetricName.Submissions]: { count: 5 } },
      updatedAt: new Date()
    }

    it('should save totals', async () => {
      mockCollection.insertOne.mockResolvedValueOnce({})

      // @ts-expect-error - partial data mocked
      await updateMetricTotals(new Date(), totals, mockSession)

      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        {
          last7Days: {
            Submissions: {
              count: 5
            }
          },
          type: 'totals-metric',
          updatedAt: expect.any(Date),
          submissions: {
            'form-id-1': 5
          }
        },
        {
          session: {}
        }
      )
    })

    it('should throw if error', async () => {
      mockCollection.insertOne.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() =>
        // @ts-expect-error - partial data mocked
        updateMetricTotals(new Date(), totals, mockSession)
      ).rejects.toThrow('db error')
    })
  })

  describe('grabLock', () => {
    it('should insert new control record if none yet exists', async () => {
      mockCollection.findOne.mockResolvedValueOnce(undefined)

      const result = await grabLock(mockSession)

      expect(mockCollection.insertOne).toHaveBeenCalled()

      expect(result).toEqual({
        lockSuccess: true,
        lastSuccessfulRun: null
      })
    })

    it('should fail to lock when already locked', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        locked: true,
        lastSuccessfulRunDate: new Date('2026-05-10T00:00:00.000Z')
      })

      const result = await grabLock(mockSession)

      expect(mockCollection.insertOne).not.toHaveBeenCalled()

      expect(result).toEqual({
        lockSuccess: false,
        lastSuccessfulRun: new Date('2026-05-10T00:00:00.000Z')
      })
    })

    it('should succeed and update lock', async () => {
      // findOneAndUpdate returns the document BEFORE the update when lock was false
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        locked: false,
        lastSuccessfulRunDate: new Date('2026-05-10T00:00:00.000Z')
      })

      const result = await grabLock(mockSession)

      expect(mockCollection.insertOne).not.toHaveBeenCalled()
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled()
      expect(mockCollection.findOne).not.toHaveBeenCalled()

      expect(result).toEqual({
        lockSuccess: true,
        lastSuccessfulRun: new Date('2026-05-10T00:00:00.000Z')
      })
    })

    it('should throw if error', async () => {
      mockCollection.findOne.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() => grabLock(mockSession)).rejects.toThrow('db error')
    })
  })

  describe('releaseLock', () => {
    it('should update control record to release lock with successful job', async () => {
      await releaseLock(true, 'ok', mockSession)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        {
          type: 'form-metric-control'
        },
        {
          $set: {
            locked: false,
            jobEnd: expect.any(Date),
            updatedAt: expect.any(Date),
            lastRunResult: 'Success: ok',
            lastSuccessfulRunDate: expect.any(Date)
          }
        },
        {
          session: {}
        }
      )
    })

    it('should update control record to release lock with failed job', async () => {
      await releaseLock(false, 'some error text', mockSession)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        {
          type: 'form-metric-control'
        },
        {
          $set: {
            locked: false,
            jobEnd: expect.any(Date),
            updatedAt: expect.any(Date),
            lastRunResult: 'Failure: some error text'
          }
        },
        {
          session: {}
        }
      )
    })

    it('should throw if error', async () => {
      mockCollection.updateOne.mockImplementationOnce(() => {
        throw new Error('db error')
      })

      await expect(() => releaseLock(true, 'ok', mockSession)).rejects.toThrow(
        'db error'
      )
    })
  })
})

/**
 * @import { FormOverviewMetric, FormTimelineMetric, FormTotalsMetric } from '@defra/forms-model'
 */
