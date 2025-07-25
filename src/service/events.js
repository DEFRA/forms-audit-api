import { messageSchema } from '@defra/forms-model'
import Joi from 'joi'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { AUDIT_RECORDS_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

/**
 *
 * @param {Message} message
 * @returns {AuditRecord}
 */
export function mapAuditEvent(message) {
  if (!message.MessageId) {
    throw new Error('Unexpected missing Message.MessageId')
  }

  if (!message.Body) {
    throw new Error('Unexpected empty Message.Body')
  }

  /**
   * @type {AuditMessage}
   */
  const messageBody = JSON.parse(message.Body)
  // /**
  //  * @type {Message}
  //  */
  // const messageData = JSON.parse(messageBody.Message)

  const value = Joi.attempt(messageBody, messageSchema)

  return {
    messageId: message.MessageId,
    ...value
  }
}

/**
 * @param {Message[]} messages
 * @returns {Promise<{ saved: Message[]; failed: Message[]; savedMessageCount: number }>}
 */
export async function createAuditEvents(messages) {
  logger.info('Inserting audit records')
  const coll = /** @type {Collection<AuditRecord>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

  /**
   * @type {Message[]}
   */
  const saved = []
  /**
   * @type {Message[]}
   */
  const failed = []

  for (const message of messages) {
    try {
      const document = mapAuditEvent(message)
      await coll.insertOne(document)
      saved.push(message)
    } catch (e) {
      failed.push(message)
      logger.error('Failed to insert message', e)
    }
  }

  logger.info('Inserted audit records')

  return { saved, failed, savedMessageCount: saved.length }
}

/**
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { AuditMessage, AuditRecord, MessageBody } from '@defra/forms-model'
 * @import { Collection } from 'mongodb'
 * @import { SNSMessage } from 'aws-lambda'
 */
