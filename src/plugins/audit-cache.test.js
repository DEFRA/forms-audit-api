import { config } from '~/src/config/index.js'
import { db } from '~/src/mongo.js'
import {
  CONSOLIDATED_CACHE_COLLECTION_NAME,
  ensureCacheIndexes,
  getCachedRecords,
  invalidateCache,
  isCachePopulated,
  populateCache
} from '~/src/plugins/audit-cache.js'

jest.mock('~/src/config/index.js', () => ({
  config: {
    get: jest.fn()
  }
}))

jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}))

jest.mock('~/src/mongo.js', () => ({
  db: {
    collection: jest.fn()
  }
}))

describe('audit-cache', () => {
  /** @type {jest.Mock} */
  let mockCountDocuments
  /** @type {jest.Mock} */
  let mockFindOne
  /** @type {jest.Mock} */
  let mockFind
  /** @type {jest.Mock} */
  let mockFindOneAndUpdate
  /** @type {jest.Mock} */
  let mockInsertMany
  /** @type {jest.Mock} */
  let mockDeleteMany
  /** @type {jest.Mock} */
  let mockCreateIndex
  /** @type {jest.Mock} */
  let mockCollection

  beforeEach(() => {
    jest.clearAllMocks()

    mockCountDocuments = jest.fn()
    mockFindOne = jest.fn()
    mockFind = jest.fn()
    mockFindOneAndUpdate = jest.fn()
    mockInsertMany = jest.fn()
    mockDeleteMany = jest.fn()
    mockCreateIndex = jest.fn()

    mockCollection = jest.fn().mockReturnValue({
      countDocuments: mockCountDocuments,
      findOne: mockFindOne,
      find: mockFind,
      findOneAndUpdate: mockFindOneAndUpdate,
      insertMany: mockInsertMany,
      deleteMany: mockDeleteMany,
      createIndex: mockCreateIndex
    })

    jest.mocked(db.collection).mockImplementation(mockCollection)
    jest.mocked(config.get).mockReturnValue(true)
  })

  describe('CONSOLIDATED_CACHE_COLLECTION_NAME', () => {
    it('should be the expected collection name', () => {
      expect(CONSOLIDATED_CACHE_COLLECTION_NAME).toBe(
        'consolidated-audit-cache'
      )
    })
  })

  describe('isCachePopulated', () => {
    it('should return true when metadata exists', async () => {
      mockCountDocuments.mockResolvedValue(1)

      const result = await isCachePopulated('entity-123')

      expect(result).toBe(true)
      expect(mockCountDocuments).toHaveBeenCalledWith(
        { entityId: 'entity-123', sortIndex: -1 },
        { limit: 1 }
      )
    })

    it('should return false when metadata does not exist', async () => {
      mockCountDocuments.mockResolvedValue(0)

      const result = await isCachePopulated('entity-123')

      expect(result).toBe(false)
    })

    it('should return false on database error', async () => {
      mockCountDocuments.mockRejectedValue(new Error('DB error'))

      const result = await isCachePopulated('entity-123')

      expect(result).toBe(false)
    })
  })

  describe('getCachedRecords', () => {
    const mockRecords = [
      { sortIndex: 0, data: { id: 'record-1' } },
      { sortIndex: 1, data: { id: 'record-2' } }
    ]

    beforeEach(() => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockRecords)
            })
          })
        })
      })
    })

    it('should return cached records with totalItems', async () => {
      mockFindOne.mockResolvedValue({ entityId: 'entity-123', totalItems: 50 })

      const result = await getCachedRecords('entity-123', {
        page: 1,
        perPage: 25
      })

      expect(result).toEqual({
        documents: [{ id: 'record-1' }, { id: 'record-2' }],
        totalItems: 50
      })
    })

    it('should return null when no metadata exists', async () => {
      mockFindOne.mockResolvedValue(null)

      const result = await getCachedRecords('entity-123', {
        page: 1,
        perPage: 25
      })

      expect(result).toBeNull()
    })

    it('should calculate correct skip for pagination', async () => {
      mockFindOne.mockResolvedValue({ totalItems: 100 })
      const mockSkip = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([])
        })
      })
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({ skip: mockSkip })
      })

      await getCachedRecords('entity-123', { page: 3, perPage: 10 })

      expect(mockSkip).toHaveBeenCalledWith(20)
    })

    it('should return null on database error', async () => {
      mockFindOne.mockRejectedValue(new Error('DB error'))

      const result = await getCachedRecords('entity-123', {
        page: 1,
        perPage: 25
      })

      expect(result).toBeNull()
    })
  })

  describe('populateCache', () => {
    const mockRecords = /** @type {ConsolidatedAuditResult[]} */ (
      /** @type {unknown} */ ([{ id: 'record-1' }, { id: 'record-2' }])
    )

    it('should insert metadata and records when cache does not exist', async () => {
      mockFindOneAndUpdate.mockResolvedValue(null)
      mockInsertMany.mockResolvedValue({ insertedCount: 2 })

      await populateCache('entity-123', mockRecords, 100)

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { entityId: 'entity-123', sortIndex: -1 },
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            entityId: 'entity-123',
            sortIndex: -1,
            totalItems: 100
          })
        }),
        { upsert: true, returnDocument: 'before' }
      )
      expect(mockInsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            entityId: 'entity-123',
            sortIndex: 0,
            data: { id: 'record-1' }
          }),
          expect.objectContaining({
            entityId: 'entity-123',
            sortIndex: 1,
            data: { id: 'record-2' }
          })
        ]),
        { ordered: false }
      )
    })

    it('should not insert records when metadata already exists', async () => {
      mockFindOneAndUpdate.mockResolvedValue({ entityId: 'entity-123' })

      await populateCache('entity-123', mockRecords, 100)

      expect(mockInsertMany).not.toHaveBeenCalled()
    })

    it('should not insert records when records array is empty', async () => {
      mockFindOneAndUpdate.mockResolvedValue(null)

      await populateCache('entity-123', [], 0)

      expect(mockInsertMany).not.toHaveBeenCalled()
    })

    it('should invalidate cache on error', async () => {
      mockFindOneAndUpdate.mockRejectedValue(new Error('DB error'))
      mockDeleteMany.mockResolvedValue({ deletedCount: 0 })

      await populateCache('entity-123', mockRecords, 100)

      expect(mockDeleteMany).toHaveBeenCalledWith({ entityId: 'entity-123' })
    })
  })

  describe('invalidateCache', () => {
    it('should delete all cache entries for entity', async () => {
      mockDeleteMany.mockResolvedValue({ deletedCount: 5 })

      await invalidateCache('entity-123')

      expect(mockDeleteMany).toHaveBeenCalledWith({ entityId: 'entity-123' })
    })

    it('should handle delete errors gracefully', async () => {
      mockDeleteMany.mockRejectedValue(new Error('DB error'))

      await expect(invalidateCache('entity-123')).resolves.toBeUndefined()
    })
  })

  describe('ensureCacheIndexes', () => {
    it('should create compound index on entityId and sortIndex', async () => {
      mockCreateIndex.mockResolvedValue('entityId_1_sortIndex_1')

      await ensureCacheIndexes()

      expect(mockCreateIndex).toHaveBeenCalledWith({
        entityId: 1,
        sortIndex: 1
      })
    })

    it('should handle index creation errors gracefully', async () => {
      mockCreateIndex.mockRejectedValue(new Error('Index error'))

      await expect(ensureCacheIndexes()).resolves.toBeUndefined()
    })
  })
})

/**
 * @import { ConsolidatedAuditResult } from '~/src/repositories/aggregation/types.js'
 */
