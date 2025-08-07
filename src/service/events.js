import { messageSchema } from '@defra/forms-model'
import Joi from 'joi'

import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { deleteEventMessage } from '~/src/messaging/event.js'
import { AUDIT_RECORDS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { mapAuditRecord } from '~/src/routes/shared.js'

const logger = createLogger()

const MAX_RECORDS = 100

/**
 * @param {Message} message
 * @returns {AuditRecordInput}
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

  const value = Joi.attempt(messageBody, messageSchema, {
    abortEarly: false
  })

  return {
    messageId: message.MessageId,
    ...value,
    recordCreatedAt: new Date()
  }
}

/**
 * Create audit records
 * @param {Message[]} messages
 * @returns {Promise<{ saved: Message[]; failed: Message[]; savedMessageCount: number }>}
 */
export async function createAuditEvents(messages) {
  logger.info('Inserting audit records')

  const coll = /** @type {Collection<AuditRecordInput>} */ (
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

  /**
   * @param {Message} message
   */
  async function createAuditEvent(message) {
    try {
      const document = mapAuditEvent(message)

      logger.info(`Inserting ${message.MessageId}`)

      await coll.insertOne(document)

      logger.info(`Inserted ${message.MessageId}`)

      logger.info(`Deleting ${message.MessageId}`)

      await deleteEventMessage(message)

      logger.info(`Deleted ${message.MessageId}`)

      saved.push(message)
    } catch (err) {
      failed.push(message)
      logger.error(
        `[createAuditEvent] Failed to insert message - ${getErrorMessage(err)}`
      )
    }
  }

  await Promise.allSettled(messages.map(createAuditEvent))

  logger.info('Inserted audit records')

  return { saved, failed, savedMessageCount: saved.length }
}

/**
 * Query audit records
 * @param {{ entityId: string }} filter
 */
export async function readAuditEvents(filter) {
  logger.info('Reading audit records')

  const coll = /** @type {Collection<AuditRecordInput>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

  const results = await coll.find(filter).limit(MAX_RECORDS).toArray()

  logger.info('Read audit records')

  return results.map(mapAuditRecord)
}

/**
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { AuditRecordInput, AuditMessage, AuditRecord } from '@defra/forms-model'
 * @import { Collection } from 'mongodb'
 */
