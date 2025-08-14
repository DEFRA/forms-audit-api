import {
  AuditEventMessageCategory,
  AuditEventMessageSource,
  AuditEventMessageType
} from '@defra/forms-model'
import { ValidationError } from 'joi'
import { ObjectId } from 'mongodb'
import { pino } from 'pino'

import {
  STUB_AUDIT_RECORD_ID,
  buildAuditMetaBase,
  buildAuditRecord,
  buildAuditRecordDocument,
  buildAuditRecordInput,
  buildFormUpdatedMessage,
  buildLiveCreatedFromDraftMessage,
  buildMessage,
  buildMessageFromAuditMessage,
  rawMessageDelivery
} from '~/src/api/forms/__stubs__/audit.js'
import { deleteEventMessage } from '~/src/messaging/event.js'
import { prepareDb } from '~/src/mongo.js'
import * as auditRecord from '~/src/repositories/audit-record-repository.js'
import {
  createAuditEvents,
  mapAuditEvent,
  readAuditEvents
} from '~/src/service/events.js'

jest.mock('~/src/messaging/event.js')
jest.mock('~/src/repositories/audit-record-repository.js')
jest.mock('~/src/messaging/event.js')

jest.mock('~/src/mongo.js', () => {
  let isPrepared = false

  return {
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

describe('events', () => {
  const recordInput = buildAuditMetaBase({
    recordCreatedAt: new Date('2025-08-08'),
    messageId: '23b3e93c-5bea-4bcc-ab27-be69ce82a190'
  })
  const entityId = '68836f68210543a49431e4b2'
  const auditMessage = buildLiveCreatedFromDraftMessage({
    entityId
  })
  const auditRecordInput = buildAuditRecordInput(auditMessage, recordInput)
  const documentId = new ObjectId(STUB_AUDIT_RECORD_ID)
  const auditDocument = buildAuditRecordDocument(auditMessage, {
    _id: documentId,
    ...auditRecordInput
  })

  beforeAll(async () => {
    await prepareDb(pino())
  })

  describe('mapAuditEvents', () => {
    /**
     *
     * @type {Message}
     */
    const auditEventMessage = buildMessage({
      Body: rawMessageDelivery(
        true,
        '{\n     "entityId": "689b7ab1d0eeac9711a7fb33",\n     "category": "FORM",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "createdAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "689b7ab1d0eeac9711a7fb33",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.uk",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n,\n     "source": "FORMS_MANAGER"\n   }'
      ),
      MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
      MessageAttributes: {},
      MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
      ReceiptHandle:
        'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
    })

    it('should map the message', () => {
      expect(mapAuditEvent(auditEventMessage)).toEqual({
        entityId: '689b7ab1d0eeac9711a7fb33',
        messageCreatedAt: expect.any(Date),
        recordCreatedAt: expect.any(Date),
        messageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        category: AuditEventMessageCategory.FORM,
        createdAt: new Date('2025-07-23T00:00:00.000Z'),
        createdBy: {
          displayName: 'Enrique Chase',
          id: '83f09a7d-c80c-4e15-bcf3-641559c7b8a7'
        },
        data: {
          formId: '689b7ab1d0eeac9711a7fb33',
          organisation: 'Defra',
          slug: 'audit-form',
          teamEmail: 'forms@example.uk',
          teamName: 'Forms',
          title: 'My Audit Event Form'
        },
        schemaVersion: 1,
        type: AuditEventMessageType.FORM_CREATED,
        source: AuditEventMessageSource.FORMS_MANAGER
      })
    })

    it('should allow unknown fields the message', () => {
      const event = mapAuditEvent({
        ...auditEventMessage,
        // @ts-expect-error - unknown field
        unknownField: 'visible'
      })
      // @ts-expect-error - unknown field
      expect(event.unknownField).toBeUndefined()
    })

    it('should fail if there is no MessageId', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { MessageId, ...auditEventMessageWithoutMessageId } =
        auditEventMessage

      expect(() => mapAuditEvent(auditEventMessageWithoutMessageId)).toThrow(
        new Error('Unexpected missing Message.MessageId')
      )
    })

    it('should fail if there is no Body', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { Body, ...auditEventMessageWithoutBody } = auditEventMessage

      expect(() => mapAuditEvent(auditEventMessageWithoutBody)).toThrow(
        new Error('Unexpected empty Message.Body')
      )
    })

    it('should fail if the message is invalid', () => {
      /**
       *
       * @type {Message}
       */
      const auditEventMessage = buildMessage({
        Body: rawMessageDelivery(
          true,
          '{\n     "entityId": "689b7ab1d0eeac9711a7fb33",\n     "category": "FORM",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "689b7ab1d0eeac9711a7fb33",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.uk",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n,\n     "source": "FORMS_MANAGER"\n   }'
        ),
        MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
        MessageAttributes: {},
        MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        ReceiptHandle:
          'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
      })

      expect(() => mapAuditEvent(auditEventMessage)).toThrow(
        new ValidationError('"createdAt" is required', [], auditEventMessage)
      )
    })
  })

  describe('readAuditEvents', () => {
    it('should read the audit events', async () => {
      const expectedAuditRecord = buildAuditRecord(auditMessage, {
        id: STUB_AUDIT_RECORD_ID,
        ...recordInput
      })
      jest
        .mocked(auditRecord.getAuditRecords)
        .mockResolvedValueOnce([auditDocument])

      const auditRecords = await readAuditEvents({ entityId }, 0)
      expect(auditRecords).toEqual([expectedAuditRecord])
    })
  })

  describe('createAuditEvents', () => {
    const messageId1 = '01267dd5-8cc7-4749-9802-40190f6429eb'
    const messageId2 = '5dd16f40-6118-4797-97c9-60a298c9a898'
    const messageId3 = '70c0155c-e9a9-4b90-a45f-a839924fca65'
    const auditMessage2 = buildFormUpdatedMessage()
    const auditMessage3 = buildLiveCreatedFromDraftMessage()
    const message1 = buildMessageFromAuditMessage(auditMessage, {
      MessageId: messageId1
    })
    const message2 = buildMessageFromAuditMessage(auditMessage2, {
      MessageId: messageId2
    })
    const message3 = buildMessageFromAuditMessage(auditMessage3, {
      MessageId: messageId3
    })
    const messages = [message1, message2, message3]

    it('should create a list of audit events', async () => {
      const expectedMapped1 = {
        ...auditMessage,
        ...recordInput,
        recordCreatedAt: expect.any(Date),
        messageId: messageId1
      }
      const expectedMapped2 = {
        ...auditMessage2,
        ...recordInput,
        recordCreatedAt: expect.any(Date),
        messageId: messageId2
      }
      const expectedMapped3 = {
        ...auditMessage3,
        ...recordInput,
        recordCreatedAt: expect.any(Date),
        messageId: messageId3
      }
      const result = await createAuditEvents(messages)
      expect(auditRecord.createAuditRecord).toHaveBeenCalledTimes(3)
      expect(auditRecord.createAuditRecord).toHaveBeenNthCalledWith(
        1,
        expectedMapped1,
        expect.anything()
      )
      expect(auditRecord.createAuditRecord).toHaveBeenNthCalledWith(
        2,
        expectedMapped2,
        expect.anything()
      )
      expect(auditRecord.createAuditRecord).toHaveBeenNthCalledWith(
        3,
        expectedMapped3,
        expect.anything()
      )
      expect(deleteEventMessage).toHaveBeenCalledTimes(3)
      expect(deleteEventMessage).toHaveBeenNthCalledWith(1, message1)
      expect(deleteEventMessage).toHaveBeenNthCalledWith(2, message2)
      expect(deleteEventMessage).toHaveBeenNthCalledWith(3, message3)

      expect(result).toEqual({
        saved: messages,
        failed: []
      })
    })

    it('should handle failures', async () => {
      jest
        .mocked(auditRecord.createAuditRecord)
        .mockResolvedValueOnce(undefined)
      jest
        .mocked(auditRecord.createAuditRecord)
        .mockRejectedValueOnce(new Error('error in create'))
      jest
        .mocked(auditRecord.createAuditRecord)
        .mockResolvedValueOnce(undefined)
      jest.mocked(deleteEventMessage).mockResolvedValueOnce({
        $metadata: { httpStatusCode: 200 }
      })
      jest
        .mocked(deleteEventMessage)
        .mockRejectedValueOnce(new Error('error in delete'))
      const result = await createAuditEvents(messages)
      expect(result).toEqual({
        saved: [message1],
        failed: [new Error('error in create'), new Error('error in delete')]
      })
    })
  })
})

/**
 * @import {Message} from '@aws-sdk/client-sqs'
 */
