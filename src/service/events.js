import { messageSchema } from '@defra/forms-model'
import Joi from 'joi'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { AUDIT_RECORDS_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

/**
 *
 * @param {SQSMessage} message
 * @returns {AuditRecord}
 */
export function mapAuditEvents(message) {
  if (!message.MessageId) {
    throw new Error('Unexpected missing Message.MessageId')
  }

  if (!message.Body) {
    throw new Error('Unexpected empty Message.Body')
  }

  /**
   * @type {Message}
   */
  const messageBody = JSON.parse(message.Body)
  const messageData = JSON.parse(messageBody.Message)

  const value = Joi.attempt(messageData, messageSchema)

  return {
    messageId: message.MessageId,
    ...value
  }
}

export async function createAuditEvents(messages) {
  logger.info('Inserting audit records')

  const coll = /** @satisfies {Collection<AuditRecord>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

  const documents = messages.map(mapAuditEvents)

  const result = await coll.insertMany(documents, {
    ordered: false
  })

  logger.info('Inserted audit records')

  const mismatch = documents.length !== result.insertedCount

  logger.info('Delete consumed messages')

  // Delete message here...

  logger.info('Deleted consumed messages')
}

/**
 * @import { Message as SQSMessage } from '@aws-sdk/client-sqs'
 * @import { Message, AuditRecord } from '@defra/forms-model'
 * @import { Collection } from 'mongodb'
 */
