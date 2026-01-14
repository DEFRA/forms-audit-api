import {
  AuditEventMessageCategory,
  AuditEventMessageType
} from '@defra/forms-model'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import {
  STUB_AUDIT_RECORD_ID,
  buildAuditMetaBase,
  buildAuditRecordDocument,
  buildAuditRecordDocumentMeta,
  buildAuditRecordInput,
  buildLiveCreatedFromDraftMessage
} from '~/src/api/forms/__stubs__/audit.js'
import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import { db } from '~/src/mongo.js'
import {
  createAuditRecord,
  getAuditRecords,
  getConsolidatedAuditRecords
} from '~/src/repositories/audit-record-repository.js'

const mockGetCachedRecords = jest.fn()
const mockPopulateCache = jest.fn()

jest.mock('~/src/plugins/audit-cache.js', () => ({
  /** @param {any[]} args */
  getCachedRecords: (...args) => mockGetCachedRecords(...args),
  /** @param {any[]} args */
  populateCache: (...args) => mockPopulateCache(...args)
}))

const mockCollection = buildMockCollection()

/**
 * @type {any}
 */
const mockSession = {}

jest.mock('~/src/mongo.js', () => {
  let isPrepared = false
  const collection =
    /** @satisfies {Collection<{draft: FormDefinition}>} */ jest
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

describe('audit-record-repository', () => {
  const recordInput = buildAuditMetaBase({
    recordCreatedAt: new Date('2025-08-08'),
    messageId: '23b3e93c-5bea-4bcc-ab27-be69ce82a190'
  })
  const auditMessage = buildLiveCreatedFromDraftMessage()
  const auditRecordInput = buildAuditRecordInput(auditMessage, recordInput)
  const documentId = new ObjectId(STUB_AUDIT_RECORD_ID)
  const auditDocument = buildAuditRecordDocument(
    auditMessage,
    buildAuditRecordDocumentMeta({
      _id: documentId,
      ...auditRecordInput
    })
  )

  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(mockCollection)
    mockGetCachedRecords.mockReset()
    mockPopulateCache.mockReset()
    mockGetCachedRecords.mockResolvedValue(null)
  })

  describe('getAuditRecords', () => {
    it('should get audit records sorted by createdAt descending with default pagination', async () => {
      const toArrayStub = jest.fn().mockResolvedValueOnce([auditDocument])
      const limitStub = jest.fn().mockReturnValue({
        toArray: toArrayStub
      })
      const skipStub = jest.fn().mockReturnValue({
        limit: limitStub
      })
      const sortStub = jest.fn().mockReturnValue({
        skip: skipStub
      })
      mockCollection.find.mockReturnValueOnce({
        sort: sortStub
      })
      mockCollection.countDocuments.mockResolvedValueOnce(1)

      const result = await getAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 100 }
      )

      const [filter] = mockCollection.find.mock.calls[0]
      expect(filter).toEqual({ entityId: STUB_AUDIT_RECORD_ID })
      expect(sortStub).toHaveBeenCalledWith({ createdAt: -1 })
      expect(skipStub).toHaveBeenCalledWith(0)
      expect(limitStub).toHaveBeenCalledWith(100)
      expect(result).toEqual({
        documents: [auditDocument],
        totalItems: 1
      })
    })

    it('should get audit records with custom pagination', async () => {
      const toArrayStub = jest.fn().mockResolvedValueOnce([auditDocument])
      const limitStub = jest.fn().mockReturnValue({
        toArray: toArrayStub
      })
      const skipStub = jest.fn().mockReturnValue({
        limit: limitStub
      })
      const sortStub = jest.fn().mockReturnValue({
        skip: skipStub
      })
      mockCollection.find.mockReturnValueOnce({
        sort: sortStub
      })
      mockCollection.countDocuments.mockResolvedValueOnce(50)

      const result = await getAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 2, perPage: 10 }
      )

      const [filter] = mockCollection.find.mock.calls[0]
      expect(filter).toEqual({ entityId: STUB_AUDIT_RECORD_ID })
      expect(sortStub).toHaveBeenCalledWith({ createdAt: -1 })
      expect(skipStub).toHaveBeenCalledWith(10)
      expect(limitStub).toHaveBeenCalledWith(10)
      expect(result).toEqual({
        documents: [auditDocument],
        totalItems: 50
      })
    })

    it('should cap perPage at MAX_RESULTS', async () => {
      const toArrayStub = jest.fn().mockResolvedValueOnce([auditDocument])
      const limitStub = jest.fn().mockReturnValue({
        toArray: toArrayStub
      })
      const skipStub = jest.fn().mockReturnValue({
        limit: limitStub
      })
      const sortStub = jest.fn().mockReturnValue({
        skip: skipStub
      })
      mockCollection.find.mockReturnValueOnce({
        sort: sortStub
      })
      mockCollection.countDocuments.mockResolvedValueOnce(500)

      await getAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 200 }
      )

      expect(limitStub).toHaveBeenCalledWith(100)
    })

    it('should handle get audit record failures', async () => {
      mockCollection.find.mockImplementation(() => {
        throw new Error('an error')
      })

      await expect(
        getAuditRecords(
          { entityId: STUB_AUDIT_RECORD_ID },
          { page: 1, perPage: 100 }
        )
      ).rejects.toThrow(new Error('an error'))
    })

    it('should return all records without pagination when not provided', async () => {
      const toArrayStub = jest.fn().mockResolvedValueOnce([auditDocument])
      const sortStub = jest.fn().mockReturnValue({
        toArray: toArrayStub
      })
      mockCollection.find.mockReturnValueOnce({
        sort: sortStub
      })

      const result = await getAuditRecords({ entityId: STUB_AUDIT_RECORD_ID })

      const [filter] = mockCollection.find.mock.calls[0]
      expect(filter).toEqual({ entityId: STUB_AUDIT_RECORD_ID })
      expect(sortStub).toHaveBeenCalledWith({ createdAt: -1 })
      expect(result).toEqual({
        documents: [auditDocument]
      })
      expect(mockCollection.countDocuments).not.toHaveBeenCalled()
    })
  })

  describe('createAuditRecord', () => {
    it('should create an audit record', async () => {
      await createAuditRecord(auditRecordInput, mockSession)
      const [insertedAuditRecordInput, session] =
        mockCollection.insertOne.mock.calls[0]
      expect(insertedAuditRecordInput).toEqual(auditRecordInput)
      expect(session).toEqual({ session: mockSession })
    })

    it('should handle failures', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(
        createAuditRecord(auditRecordInput, mockSession)
      ).rejects.toThrow(new Error('Failed'))
    })
  })

  describe('getConsolidatedAuditRecords', () => {
    const user1 = { id: 'user-1', displayName: 'User One' }

    it('should throw Boom.badRequest when entityId is not provided', async () => {
      await expect(
        getConsolidatedAuditRecords(
          { category: AuditEventMessageCategory.FORM },
          { page: 1, perPage: 10 }
        )
      ).rejects.toThrow(
        Boom.badRequest('entityId is required for consolidated audit records')
      )
    })

    it('should return consolidated results from aggregation pipeline on cache miss', async () => {
      const consolidatedRecord = {
        ...auditDocument,
        type: AuditEventMessageType.FORM_UPDATED,
        createdBy: user1
      }
      const mockAggregationResult = [
        {
          metadata: [{ totalItems: 1 }],
          records: [
            {
              record: consolidatedRecord,
              consolidatedCount: 3,
              consolidatedFrom: new Date('2025-08-07T10:00:00Z'),
              consolidatedTo: new Date('2025-08-07T12:00:00Z')
            }
          ]
        }
      ]

      const toArrayStub = jest.fn().mockResolvedValueOnce(mockAggregationResult)
      mockCollection.aggregate.mockReturnValueOnce({
        toArray: toArrayStub
      })

      const result = await getConsolidatedAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 10 }
      )

      expect(mockCollection.aggregate).toHaveBeenCalledWith(expect.any(Array))
      expect(result.totalItems).toBe(1)
      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]).toMatchObject({
        consolidatedCount: 3,
        consolidatedFrom: new Date('2025-08-07T10:00:00Z'),
        consolidatedTo: new Date('2025-08-07T12:00:00Z')
      })
    })

    it('should return non-consolidated records without consolidation metadata', async () => {
      const singleRecord = {
        ...auditDocument,
        type: AuditEventMessageType.FORM_CREATED,
        createdBy: user1
      }
      const mockAggregationResult = [
        {
          metadata: [{ totalItems: 1 }],
          records: [
            {
              record: singleRecord,
              consolidatedCount: 1,
              consolidatedFrom: new Date('2025-08-07T10:00:00Z'),
              consolidatedTo: new Date('2025-08-07T10:00:00Z')
            }
          ]
        }
      ]

      const toArrayStub = jest.fn().mockResolvedValueOnce(mockAggregationResult)
      mockCollection.aggregate.mockReturnValueOnce({
        toArray: toArrayStub
      })

      const result = await getConsolidatedAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 10 }
      )

      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]).not.toHaveProperty('consolidatedCount')
      expect(result.documents[0]).not.toHaveProperty('consolidatedFrom')
    })

    it('should return empty array when no results', async () => {
      const mockAggregationResult = [
        {
          metadata: [],
          records: []
        }
      ]

      const toArrayStub = jest.fn().mockResolvedValueOnce(mockAggregationResult)
      mockCollection.aggregate.mockReturnValueOnce({
        toArray: toArrayStub
      })

      const result = await getConsolidatedAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 10 }
      )

      expect(result.totalItems).toBe(0)
      expect(result.documents).toEqual([])
    })

    it('should handle aggregation failures', async () => {
      mockCollection.aggregate.mockImplementation(() => {
        throw new Error('Aggregation failed')
      })

      await expect(
        getConsolidatedAuditRecords(
          { entityId: STUB_AUDIT_RECORD_ID },
          { page: 1, perPage: 10 }
        )
      ).rejects.toThrow(new Error('Aggregation failed'))
    })

    it('should clean up temporary aggregation fields from records', async () => {
      const recordWithTempFields = {
        ...auditDocument,
        type: AuditEventMessageType.FORM_UPDATED,
        createdBy: user1,
        prevUserId: 'should-be-removed',
        prevType: 'should-be-removed',
        isNewGroup: true,
        groupNumber: 1
      }
      const mockAggregationResult = [
        {
          metadata: [{ totalItems: 1 }],
          records: [
            {
              record: recordWithTempFields,
              consolidatedCount: 2,
              consolidatedFrom: new Date('2025-08-07T10:00:00Z'),
              consolidatedTo: new Date('2025-08-07T12:00:00Z')
            }
          ]
        }
      ]

      const toArrayStub = jest.fn().mockResolvedValueOnce(mockAggregationResult)
      mockCollection.aggregate.mockReturnValueOnce({
        toArray: toArrayStub
      })

      const result = await getConsolidatedAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 10 }
      )

      expect(result.documents[0]).not.toHaveProperty('prevUserId')
      expect(result.documents[0]).not.toHaveProperty('prevType')
      expect(result.documents[0]).not.toHaveProperty('isNewGroup')
      expect(result.documents[0]).not.toHaveProperty('groupNumber')
    })

    it('should return cached results on cache hit', async () => {
      const cachedValue = {
        documents: [{ _id: 'cached-doc', type: 'FORM_CREATED' }],
        totalItems: 1
      }
      mockGetCachedRecords.mockResolvedValueOnce(cachedValue)

      const result = await getConsolidatedAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 10 }
      )

      expect(result).toEqual(cachedValue)
      expect(mockCollection.aggregate).not.toHaveBeenCalled()
    })

    it('should populate cache with all records on cache miss', async () => {
      const consolidatedRecord = {
        ...auditDocument,
        type: AuditEventMessageType.FORM_UPDATED,
        createdBy: user1
      }
      const mockAggregationResult = [
        {
          metadata: [{ totalItems: 1 }],
          records: [
            {
              record: consolidatedRecord,
              consolidatedCount: 1,
              consolidatedFrom: new Date('2025-08-07T10:00:00Z'),
              consolidatedTo: new Date('2025-08-07T10:00:00Z')
            }
          ]
        }
      ]

      const toArrayStub = jest.fn().mockResolvedValueOnce(mockAggregationResult)
      mockCollection.aggregate.mockReturnValueOnce({
        toArray: toArrayStub
      })

      await getConsolidatedAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 1, perPage: 10 }
      )

      expect(mockPopulateCache).toHaveBeenCalledWith(
        STUB_AUDIT_RECORD_ID,
        expect.any(Array),
        1
      )
    })

    it('should return correct page from aggregation results', async () => {
      const records = Array.from({ length: 30 }, () => ({
        ...auditDocument,
        _id: new ObjectId(),
        type: AuditEventMessageType.FORM_UPDATED,
        createdBy: user1
      }))

      const mockAggregationResult = [
        {
          metadata: [{ totalItems: 30 }],
          records: records.map((record) => ({
            record,
            consolidatedCount: 1,
            consolidatedFrom: new Date('2025-08-07T10:00:00Z'),
            consolidatedTo: new Date('2025-08-07T10:00:00Z')
          }))
        }
      ]

      const toArrayStub = jest.fn().mockResolvedValueOnce(mockAggregationResult)
      mockCollection.aggregate.mockReturnValueOnce({
        toArray: toArrayStub
      })

      const result = await getConsolidatedAuditRecords(
        { entityId: STUB_AUDIT_RECORD_ID },
        { page: 2, perPage: 10 }
      )

      // Should return items 10-19 (page 2 with perPage 10)
      expect(result.documents).toHaveLength(10)
      expect(result.totalItems).toBe(30)
    })
  })
})
