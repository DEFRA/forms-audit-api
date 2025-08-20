import { messageSchema } from '@defra/forms-model'
import Joi from 'joi'

import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { deleteEventMessage } from '~/src/messaging/event.js'
import { client } from '~/src/mongo.js'
import * as auditRecord from '~/src/repositories/audit-record-repository.js'
import { mapAuditRecord } from '~/src/routes/shared.js'

const logger = createLogger()

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

  logger.debug(`Received message of type: ${messageBody.type}`)

  const value = Joi.attempt(messageBody, messageSchema, {
    abortEarly: false,
    stripUnknown: true
  })

  return {
    messageId: message.MessageId,
    ...value,
    recordCreatedAt: new Date()
  }
}

/**
 * Query audit records
 * @param {{ entityId: string; category?: AuditEventMessageCategory }} filter
 * @param {number} skip
 */
export async function readAuditEvents(filter, skip) {
  const results = await auditRecord.getAuditRecords(filter, skip)

  return results.map(mapAuditRecord)
}

/**
 * Create audit records
 * @param {Message[]} messages
 * @returns {Promise<{ saved: Message[]; failed: any[] }>}
 */
export async function createAuditEvents(messages) {
  logger.info('Inserting audit records')

  /**
   * @param {Message} message
   */
  async function createAuditEvent(message) {
    const session = client.startSession()

    try {
      return await session.withTransaction(async () => {
        const document = mapAuditEvent(message)

        await auditRecord.createAuditRecord(document, session)

        logger.info(`Deleting ${message.MessageId}`)

        await deleteEventMessage(message)

        logger.info(`Deleted ${message.MessageId}`)

        return message
      })
    } catch (err) {
      logger.error(
        `[createAuditEvent] Failed to insert message - ${getErrorMessage(err)}`
      )
      throw err
    } finally {
      await session.endSession()
    }
  }

  const results = await Promise.allSettled(messages.map(createAuditEvent))

  const saved = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
  const savedMessage = saved.map((item) => item.MessageId).join(',')

  logger.info(`Inserted audit records: ${savedMessage}`)

  const failed = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason)

  if (failed.length) {
    const failedMessage = failed.map((item) => getErrorMessage(item)).join(',')

    logger.info(`Failed to insert audit records: ${failedMessage}`)
  }

  return { saved, failed }
}

/**
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { AuditRecordInput, AuditMessage, AuditEventMessageCategory } from '@defra/forms-model'
 */
