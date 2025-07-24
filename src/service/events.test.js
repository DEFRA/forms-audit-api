import {
  AuditEventMessageCategory,
  AuditEventMessageType
} from '@defra/forms-model'
import { ValidationError } from 'joi'

import { mapAuditEvents } from '~/src/service/events.js'

describe('events', () => {
  describe('mapAuditEvents', () => {
    /**
     *
     * @type {Message}
     */
    const auditEventMessage = {
      Body: '{\n     "category": "FORM",\n     "createdAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.com",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n   }',
      MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
      MessageAttributes: {},
      MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
      ReceiptHandle:
        'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
    }

    it('should map the message', () => {
      expect(mapAuditEvents(auditEventMessage)).toEqual({
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
        type: AuditEventMessageType.FORM_CREATED
      })
    })

    it('should fail if the message is invalid', () => {
      /**
       *
       * @type {Message}
       */
      const auditEventMessage = {
        Body: '{\n     "category": "FORM",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.com",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n   }',
        MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
        MessageAttributes: {},
        MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        ReceiptHandle:
          'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
      }

      expect(() => mapAuditEvents(auditEventMessage)).toThrow(
        new ValidationError('"createdAt" is required')
      )
    })
  })
})

/**
 * @import {Message} from '@aws-sdk/sqs-client'
 */
