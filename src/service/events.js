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
   * @type {SNSMessage}
   */
  const messageBody = JSON.parse(message.Body)
  /**
   * @type {Message}
   */
  const messageData = JSON.parse(messageBody.Message)

  const value = Joi.attempt(messageData, messageSchema)

  return {
    messageId: message.MessageId,
    ...value
  }
}

/**
 * @param {Message[]} messages
 * @returns {Promise<{ savedIds: {id: string, receiptHandle: string}[]; failedIds: {id: string, receiptHandle: string}[] }>}
 */
export async function createAuditEvents(messages) {
  logger.info('Inserting audit records')
  const coll = /** @type {Collection<AuditRecord>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

  /**
   * @type {{id: string, receiptHandle: string}[]}
   */
  const savedIds = []
  /**
   * @type {{id: string, receiptHandle: string}[]}
   */
  const failedIds = []

  for (const message of messages) {
    try {
      const document = mapAuditEvent(message)
      await coll.insertOne(document)
      savedIds.push({
        id: message.MessageId,
        receiptHandle: message.ReceiptHandle
      })
    } catch (e) {
      failedIds.push({
        id: message.MessageId,
        receiptHandle: message.ReceiptHandle
      })
      console.error('Failed to insert message', e)
    }
  }

  logger.info('Inserted audit records')

  return { savedIds, failedIds }
}

/**
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { AuditMessage, AuditRecord, MessageBody } from '@defra/forms-model'
 * @import { Collection } from 'mongodb'
 * @import { SNSMessage } from 'aws-lambda'
 */
