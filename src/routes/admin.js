import { Scopes } from '@defra/forms-model'
import Joi from 'joi'

import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  deleteDlqMessage,
  receiveDlqMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'

const logger = createLogger()

const OK_RESPONSE = 200

const messageIdSchema = Joi.object({
  messageId: Joi.string().required()
})

const receiptHandleSchema = Joi.object({
  receiptHandle: Joi.string().required()
})

export default [
  /**
   * @satisfies {ServerRoute}
   */
  ({
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
  }),

  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'POST',
    path: '/admin/deadletter/redrive',
    async handler(_request, h) {
      logger.info('Redriving DLQ')
      await redriveDlqMessages()
      logger.info('Redrive DLQ triggered successfully')
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<{ Params: { messageId: string }, Payload: { receiptHandle: string } }>}
   */
  ({
    method: 'DELETE',
    path: '/admin/deadletter/{messageId}',
    async handler(request, h) {
      const { params, payload } = request
      logger.info(`Deleting DLQ message ${params.messageId}`)
      await deleteDlqMessage(payload.receiptHandle)
      logger.info(`Deleted DLQ message ${params.messageId}`)
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: messageIdSchema,
        payload: receiptHandleSchema
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
