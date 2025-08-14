import { AuditEventMessageCategory, idSchema } from '@defra/forms-model'
import Joi from 'joi'

import { readAuditEvents } from '~/src/service/events.js'

/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/audit/forms/{id}',
  async handler(request) {
    const { params, query } = request
    const { id } = params
    const { skip } = query
    const skipCount = skip ?? 0
    const auditRecords = await readAuditEvents(
      {
        category: AuditEventMessageCategory.FORM,
        entityId: id
      },
      skipCount
    )
    return {
      auditRecords,
      skip: skipCount
    }
  },
  options: {
    auth: false,
    validate: {
      params: Joi.object().keys({
        id: idSchema
      }),
      query: Joi.object().keys({
        skip: Joi.number().optional()
      })
    }
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
