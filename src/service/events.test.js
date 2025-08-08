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
  buildLiveCreatedFromDraftMessage
} from '~/src/api/forms/__stubs__/audit.js'
import { prepareDb } from '~/src/mongo.js'
import * as auditRecord from '~/src/repositories/audit-record-repository.js'
import { mapAuditEvent, readAuditEvents } from '~/src/service/events.js'

jest.mock('~/src/messaging/event.js')
jest.mock('~/src/repositories/audit-record-repository.js')

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
/**
 * @param {boolean} rawMessageDelivery
 * @param {string} body
 * @returns {string}
 */
function rawMessageDelivery(rawMessageDelivery, body) {
  if (rawMessageDelivery) {
    return body
  }
  return JSON.stringify({
    Message: body
  })
}

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
    const auditEventMessage = {
      Body: rawMessageDelivery(
        true,
        '{\n     "entityId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n     "category": "FORM",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "createdAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.com",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n,\n     "source": "FORMS_MANAGER"\n   }'
      ),
      MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
      MessageAttributes: {},
      MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
      ReceiptHandle:
        'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
    }

    it('should map the message', () => {
      expect(mapAuditEvent(auditEventMessage)).toEqual({
        entityId: '3b1bf4b2-1603-4ca5-b885-c509245567aa',
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
          formId: '3b1bf4b2-1603-4ca5-b885-c509245567aa',
          organisation: 'Defra',
          slug: 'audit-form',
          teamEmail: 'forms@example.com',
          teamName: 'Forms',
          title: 'My Audit Event Form'
        },
        schemaVersion: 1,
        type: AuditEventMessageType.FORM_CREATED,
        source: AuditEventMessageSource.FORMS_MANAGER
      })
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
      const auditEventMessage = {
        Body: rawMessageDelivery(
          true,
          '{\n     "entityId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n     "category": "FORM",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.com",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n,\n     "source": "FORMS_MANAGER"\n   }'
        ),
        MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
        MessageAttributes: {},
        MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        ReceiptHandle:
          'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
      }

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

      const auditRecords = await readAuditEvents({ entityId })
      expect(auditRecords).toEqual([expectedAuditRecord])
    })
  })
})

/**
 * @import {Message} from '@aws-sdk/client-sqs'
 */
