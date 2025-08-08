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
export function buildFormUpdatedMessage(partialFormUpdatedMessage) {
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
 * @import { WithId } from 'mongodb'
 * @import { AuditRecordInput, AuditMessage, FormUpdatedMessage, AuditInputMeta, AuditMetaBase, AuditRecord, FormLiveCreatedFromDraftMessage } from '@defra/forms-model'
 */
