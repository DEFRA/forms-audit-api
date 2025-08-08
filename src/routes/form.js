import { idSchema } from '@defra/forms-model'
import Joi from 'joi'

import { readAuditEvents } from '~/src/service/events.js'

/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/audit/forms/{id}',
  handler(request) {
    const { params } = request
    const { id } = params

    return readAuditEvents({
      entityId: id
    })
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
