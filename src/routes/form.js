import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType,
  FormDefinitionRequestType,
  idSchema
} from '@defra/forms-model'
import Joi from 'joi'
import { ObjectId } from 'mongodb'

import { STUB_MESSAGE_ID } from '~/src/api/forms/__stubs__/audit.js'

// import { readAuditEvents } from '~/src/service/events.js'

/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/audit/forms/{id}',
  handler(_request) {
    // const { params } = request
    // const { id } = params

    // return readAuditEvents({
    //   entityId: id
    // })
    return [
      {
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
    ]
  },
  options: {
    auth: false,
    validate: {
      params: Joi.object().keys({
        id: idSchema
      })
    }
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
