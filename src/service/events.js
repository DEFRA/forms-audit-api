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
   * @type {MessageBody}
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
  logger.info(messages)
  const coll = /** @satisfies {Collection<AuditRecord>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

  const documents = messages.map(mapAuditEvents)
  const bulkWriteCommands = documents.map((document) => {
    return {
      insertOne: {
        document
      }
    }
  })
  const result = await coll.bulkWrite(bulkWriteCommands, {
    ordered: false
  })

  // const result = await coll.insertMany(documents, {
  //   ordered: false
  // })

  logger.info('Inserted audit records')

  const mismatch = documents.length !== result.insertedCount
  const messageIdsToDelete = []

  if (mismatch) {
    const idsToDelete = await coll.find(
      {
        _id: {
          $in: result.insertedIds
        }
      },
      {
        projection: {
          messageId: 1
        }
      }
    )
    messageIdsToDelete.push(...idsToDelete.map((doc) => doc.messageId))

    return messageIdsToDelete
  }
  return messages.map((message) => message.messageId)
}

/**
 * @import { Message as SQSMessage } from '@aws-sdk/client-sqs'
 * @import { Message, AuditRecord, MessageBody } from '@defra/forms-model'
 * @import { Collection } from 'mongodb'
 */
