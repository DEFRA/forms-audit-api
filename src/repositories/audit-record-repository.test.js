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
  getAuditRecords
} from '~/src/repositories/audit-record-repository.js'

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
})
