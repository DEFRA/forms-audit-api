import { Scopes } from '@defra/forms-model'
import Joi from 'joi'

import { logger } from '~/src/helpers/logging/logger.js'
import {
  deleteDlqMessage,
  getDlqMessage,
  receiveDlqMessages,
  redriveDlqMessages,
  resubmitDlqMessage
} from '~/src/messaging/event.js'

const OK_RESPONSE = 200
const NOT_FOUND = 404

const messageIdSchema = Joi.object({
  messageId: Joi.string().required()
})

const timeoutQuerySchema = Joi.object({
  visibilityTimeout: Joi.number().optional(),
  waitTimeSeconds: Joi.number().optional()
})

export default [
  /**
   * @satisfies {ServerRoute<{ Query: { visibilityTimeout?: number, waitTimeSeconds?: number }}>}
   */
  ({
    method: 'GET',
    path: '/admin/deadletter/view',
    async handler(request, h) {
      const { visibilityTimeout, waitTimeSeconds } = request.query
      const messages = await receiveDlqMessages(
        visibilityTimeout,
        waitTimeSeconds
      )
      return h.response({ messages: messages.Messages ?? [] }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        query: timeoutQuerySchema
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<{ Params: { messageId: string }, Query: { visibilityTimeout?: number, waitTimeSeconds?: number }}>}
   */
  ({
    method: 'GET',
    path: '/admin/deadletter/view/{messageId}',
    async handler(request, h) {
      const { visibilityTimeout, waitTimeSeconds } = request.query
      const message = await getDlqMessage(
        request.params.messageId,
        visibilityTimeout,
        waitTimeSeconds
      )
      return h.response({ message }).code(message ? OK_RESPONSE : NOT_FOUND)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: messageIdSchema,
        query: timeoutQuerySchema
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
   * @satisfies {ServerRoute<{ Params: { messageId: string }, Payload: { messageJson: string } }>}
   */
  ({
    method: 'POST',
    path: '/admin/deadletter/resubmit/{messageId}',
    async handler(request, h) {
      const { params, payload } = request
      const { messageId } = params
      const { messageJson } = payload
      logger.info(`Resubmitting DLQ message ${messageId}`)
      await resubmitDlqMessage(messageId, JSON.stringify(messageJson))
      logger.info(`Resubmitted  DLQ message ${messageId}`)
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<{ Params: { messageId: string }, Query: { visibilityTimeout?: number, waitTimeSeconds?: number }}>}
   */
  ({
    method: 'DELETE',
    path: '/admin/deadletter/{messageId}',
    async handler(request, h) {
      const { params, query } = request
      const { messageId } = params
      logger.info(`Deleting DLQ message ${messageId}`)
      await deleteDlqMessage(
        messageId,
        query.visibilityTimeout,
        query.waitTimeSeconds
      )
      logger.info(`Deleted DLQ message ${messageId}`)
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: messageIdSchema,
        query: timeoutQuerySchema
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
