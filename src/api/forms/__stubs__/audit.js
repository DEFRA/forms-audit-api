/* istanbul ignore file */
import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType,
  FormDefinitionRequestType
} from '@defra/forms-model'
import { ObjectId } from 'mongodb'

export const STUB_RECORD_CREATED_AT = new Date('2025-08-07T10:52:41.153Z')
export const STUB_MESSAGE_ID = '4564f91e-d348-419b-96c9-da2c88e82369'
export const STUB_AUDIT_RECORD_ID = '68948579d5659369f1e634c6'

/**
 * @param {Partial<AuditMetaBase>} partialAuditMetaBase
 * @returns {AuditMetaBase}
 */
export function buildAuditMetaBase(partialAuditMetaBase = {}) {
  return {
    recordCreatedAt: STUB_RECORD_CREATED_AT,
    messageId: STUB_MESSAGE_ID,
    ...partialAuditMetaBase
  }
}

/**
 * @param {Partial<AuditInputMeta>} partialAuditInputMeta
 * @returns {AuditInputMeta}
 */
export function buildAuditInputMeta(partialAuditInputMeta = {}) {
  return {
    recordCreatedAt: STUB_RECORD_CREATED_AT,
    messageId: STUB_MESSAGE_ID,
    id: STUB_AUDIT_RECORD_ID,
    ...partialAuditInputMeta
  }
}

/**
 * @param {Partial<WithId<AuditMetaBase>>} partialAuditRecordDocumentMeta
 * @returns {WithId<AuditMetaBase>}
 */
export function buildAuditRecordDocumentMeta(
  partialAuditRecordDocumentMeta = {}
) {
  return {
    recordCreatedAt: STUB_RECORD_CREATED_AT,
    messageId: STUB_MESSAGE_ID,
    _id: new ObjectId(STUB_AUDIT_RECORD_ID),
    ...partialAuditRecordDocumentMeta
  }
}

/**
 * @param {Partial<FormLiveCreatedFromDraftMessage>} partialFormLiveCreatedFromDraftMessage
 * @returns {FormLiveCreatedFromDraftMessage}
 */
export function buildLiveCreatedFromDraftMessage(
  partialFormLiveCreatedFromDraftMessage = {}
) {
  return {
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_LIVE_CREATED_FROM_DRAFT,
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    source: AuditEventMessageSource.FORMS_MANAGER,
    entityId: '68836f68210543a49431e4b2',
    createdAt: new Date('2025-08-07T10:52:22.236Z'),
    createdBy: {
      id: '396e84b4-1cbd-40d0-af83-857be2aaefa7',
      displayName: 'David Stone'
    },
    messageCreatedAt: new Date('2025-08-07T10:52:22.246Z'),
    ...partialFormLiveCreatedFromDraftMessage
  }
}

/**
 * @param {Partial<FormUpdatedMessage>} partialFormUpdatedMessage
 * @returns {FormUpdatedMessage}
 */
export function buildFormUpdatedMessage(partialFormUpdatedMessage = {}) {
  return {
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_UPDATED,
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    source: AuditEventMessageSource.FORMS_MANAGER,
    entityId: '68836f68210543a49431e4b2',
    createdAt: new Date('2025-08-07T10:52:22.236Z'),
    createdBy: {
      id: '396e84b4-1cbd-40d0-af83-857be2aaefa7',
      displayName: 'David Stone'
    },
    data: {
      formId: '688131eeff67f889d52c66cc',
      slug: 'my-form',
      requestType: FormDefinitionRequestType.REPLACE_DRAFT,
      s3Meta: {
        fileId: 'jIEvk8KhqJfvbqE_uXYZtQ',
        filename: '688131eeff67f889d52c66cc.json',
        s3Key: 'audit-definitions/688131eeff67f889d52c66cc.json'
      }
    },
    messageCreatedAt: new Date('2025-08-07T10:52:22.246Z'),
    ...partialFormUpdatedMessage
  }
}

/**
 * @param {AuditMessage} auditMessage
 * @param {Partial<AuditRecordInput>} partialRecordInput
 * @returns {AuditRecordInput}
 */
export function buildAuditRecordInput(auditMessage, partialRecordInput = {}) {
  return {
    ...auditMessage,
    ...buildAuditMetaBase(partialRecordInput)
  }
}

/**
 *
 * @param {AuditMessage} auditMessage
 * @param {Partial<AuditInputMeta>} partialAuditInputMeta
 * @returns {AuditRecord}
 */
export function buildAuditRecord(auditMessage, partialAuditInputMeta = {}) {
  return {
    ...auditMessage,
    ...buildAuditInputMeta(partialAuditInputMeta)
  }
}

/**
 * @returns {WithId<AuditRecord>}
 */
export function buildFormUpdateAuditRecord() {
  return {
    _id: new ObjectId('68948579d5659369f1e634c6'),
    id: '68948579d5659369f1e634c6',
    messageId: STUB_MESSAGE_ID,
    category: AuditEventMessageCategory.FORM,
    type: AuditEventMessageType.FORM_UPDATED,
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    source: AuditEventMessageSource.FORMS_MANAGER,
    entityId: '68836f68210543a49431e4b2',
    createdAt: new Date('2025-08-07T10:52:22.236Z'),
    createdBy: {
      id: '396e84b4-1cbd-40d0-af83-857be2aaefa7',
      displayName: 'David Stone'
    },
    data: {
      formId: '688131eeff67f889d52c66cc',
      slug: 'my-form',
      requestType: FormDefinitionRequestType.REPLACE_DRAFT,
      s3Meta: {
        fileId: 'jIEvk8KhqJfvbqE_uXYZtQ',
        filename: '688131eeff67f889d52c66cc.json',
        s3Key: 'audit-definitions/688131eeff67f889d52c66cc.json'
      }
    },
    messageCreatedAt: new Date('2025-08-07T10:52:22.246Z'),
    recordCreatedAt: new Date('2025-08-07T10:52:41.153Z')
  }
}

/**
 * @param {Partial<FormLiveCreatedFromDraftMessage>} partialFormLiveCreatedFromDraftMessage
 * @param {Partial<AuditInputMeta>} partialAuditRecordMeta
 * @returns {AuditRecord}
 */
export function buildLiveCreatedFromDraftAuditRecord(
  partialFormLiveCreatedFromDraftMessage = {},
  partialAuditRecordMeta = {}
) {
  return {
    ...buildLiveCreatedFromDraftMessage(partialFormLiveCreatedFromDraftMessage),
    ...buildAuditInputMeta(partialAuditRecordMeta)
  }
}

/**
 *
 * @param {AuditMessage} auditMessage
 * @param {Partial<WithId<AuditMetaBase>>} partialAuditDocumentMeta
 * @returns {WithId<AuditRecordInput>}
 */
export function buildAuditRecordDocument(
  auditMessage,
  partialAuditDocumentMeta
) {
  return {
    ...auditMessage,
    ...buildAuditRecordDocumentMeta(partialAuditDocumentMeta)
  }
}

/**
 * @param {boolean} rawMessageDelivery
 * @param {string} body
 * @returns {string}
 */
export function rawMessageDelivery(rawMessageDelivery, body) {
  if (rawMessageDelivery) {
    return body
  }
  return JSON.stringify({
    Message: body
  })
}

/**
 * Builds a message from a Message Partial
 * @param {Partial<Message>} partialMessage
 * @returns {Message}
 */
export function buildMessage(partialMessage = {}) {
  return {
    Body: rawMessageDelivery(
      true,
      '{\n     "entityId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n     "category": "FORM",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "3b1bf4b2-1603-4ca5-b885-c509245567aa",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.com",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n,\n     "source": "FORMS_MANAGER"\n   }'
    ),
    MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
    MessageAttributes: {},
    MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
    ReceiptHandle:
      'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ=',
    ...partialMessage
  }
}

/**
 * Builds a message from a Message Partial and AuditMessage
 * @param {AuditMessage} auditMessage
 * @param {Partial<Message>} partialMessage
 * @returns {Message}
 */
export function buildMessageFromAuditMessage(
  auditMessage,
  partialMessage = {}
) {
  const Body = JSON.stringify(auditMessage)

  return {
    ...buildMessage(partialMessage),
    Body
  }
}
/**
 * @import { WithId } from 'mongodb'
 * @import { AuditRecordInput, AuditMessage, FormUpdatedMessage, AuditInputMeta, AuditMetaBase, AuditRecord, FormLiveCreatedFromDraftMessage } from '@defra/forms-model'
 * @import { Message } from '@aws-sdk/client-sqs'
 */
