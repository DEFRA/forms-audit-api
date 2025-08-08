import {
  buildAuditMetaBase,
  buildAuditRecordInput,
  buildLiveCreatedFromDraftMessage
} from '~/src/api/forms/__stubs__/audit.js'
import { buildMockCollection } from '~/src/api/forms/__stubs__/mongo.js'
import { db } from '~/src/mongo.js'
import { createAuditRecord } from '~/src/repositories/audit-record-repository.js'

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
  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  describe('createAuditRecord', () => {
    const recordInput = buildAuditMetaBase({
      recordCreatedAt: new Date('2025-08-08'),
      messageId: '23b3e93c-5bea-4bcc-ab27-be69ce82a190'
    })
    const auditMessage = buildLiveCreatedFromDraftMessage()
    const auditRecordInput = buildAuditRecordInput(auditMessage, recordInput)

    it('should create an audit record', async () => {
      await createAuditRecord(auditRecordInput, mockSession)
      const [insertedAuditRecordInput] = mockCollection.insertOne.mock.calls[0]
      expect(insertedAuditRecordInput).toEqual(auditRecordInput)
    })
  })
})
