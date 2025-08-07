import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType,
  FormDefinitionRequestType
} from '@defra/forms-model'
import { ObjectId } from 'mongodb'

/**
 *
 * @returns {AuditRecord}
 */
export function buildLiveCreatedFromDraftAuditRecord() {
  return {
    id: '68948579d5659369f1e634c6',
    messageId: '4564f91e-d348-419b-96c9-da2c88e82369',
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
    recordCreatedAt: new Date('2025-08-07T10:52:41.153Z')
  }
}

/**
 * @returns {WithId<AuditRecord>}
 */
export function buildFormUpdateAuditRecord() {
  return {
    _id: new ObjectId('68948579d5659369f1e634c6'),
    id: '68948579d5659369f1e634c6',
    messageId: '4564f91e-d348-419b-96c9-da2c88e82369',
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
 * @import { WithId } from 'mongodb'
 * @import { AuditRecord } from '@defra/forms-model'
 */
