import { messageSchema } from '@defra/forms-model'
import Joi from 'joi'

/**
 *
 * @param {SQSMessage} message
 * @returns {AuditRecord}
 */
export function mapAuditEvents(message) {
  /**
   * @type {Message}
   */
  const messageBody = JSON.parse(message.Body)

  const value = Joi.attempt(messageBody, messageSchema)

  return {
    messageId: message.MessageId,
    ...value
  }
}

export function createAuditEvents(messages) {
  // Mongo needs to check for duplicate message id
}

/**
 * @import { Message as SQSMessage } from '@aws-sdk/client-sqs'
 * @import { Message, AuditRecord } from '@defra/forms-model'
 */
