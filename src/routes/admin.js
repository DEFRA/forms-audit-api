import { Scopes } from '@defra/forms-model'
import Joi from 'joi'

import {
  deleteDlqMessage,
  receiveDlqMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'

const OK_RESPONSE = 200

const receiptHandleSchema = Joi.object({
  receiptHandle: Joi.string().required()
})

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'GET',
    path: '/admin/deadletter/view',
    async handler(_request, h) {
      const messages = await receiveDlqMessages()
      return h.response({ messages: messages.Messages ?? [] }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      }
    }
  },

  /**
   * @type {ServerRoute}
   */
  {
    method: 'POST',
    path: '/admin/deadletter/redrive',
    async handler(_request, h) {
      await redriveDlqMessages()
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      }
    }
  },

  /**
   * @type {ServerRoute}
   */
  {
    method: 'DELETE',
    path: '/admin/deadletter/{receiptHandle}',
    async handler(request, h) {
      const { params } = request
      await deleteDlqMessage(params.receiptHandle)
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: receiptHandleSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
