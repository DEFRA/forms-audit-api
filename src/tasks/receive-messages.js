import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand
} from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { createAuditEvents } from '~/src/service/events.js'
import { sqsClient } from '~/src/tasks/sqs.js'

const logger = createLogger()

const receiveMessageTimeout = config.get('receiveMessageTimeout')
const queueUrl = config.get('sqsEventsQueueUrl')

/**
 * @type {ReceiveMessageCommandInput}
 */
const input = {
  QueueUrl: queueUrl,
  MaxNumberOfMessages: 10, // TODO: env variable
  VisibilityTimeout: (receiveMessageTimeout / 1000) * 2
}

/**
 * Receive event messages
 * @returns {Promise<ReceiveMessageResult>}
 */
export function receiveEventMessages() {
  const command = new ReceiveMessageCommand(input)
  return sqsClient.send(command)
}

/**
 * Delete event messages
 * @param {string[]} messageId
 * @returns {Promise<DeleteMessageBatchCommandOutput>}
 */
export function deleteEventMessages(messageId) {
  const command = new DeleteMessageBatchCommand({
    QueueUrl: queueUrl,
    Entries: messageId.map((id) => ({ Id: id, ReceiptHandle: '' }))
  })

  return sqsClient.send(command)
}

// /**
//  *
//  * @param {Message[]} messages
//  * @returns
//  */
// async function saveEvents(messages) {
//   logger.info(messages)
//   // batch save in mongo, return the failed ones - if succeeded delete, otherwise leave
//   return Promise.resolve(true)
// }

/**
 * Task to poll for message and store the result in the DB
 */
export async function runTask() {
  logger.info('Receiving queue messages')

  const result = await receiveEventMessages()
  const messages = result.Messages
  const messageCount = messages ? messages.length : 0

  logger.info(`Received ${messageCount} queue messages`)

  if (messages && messageCount) {
    logger.info('Saving queue messages to DB')

    await createAuditEvents(messages)
    // await saveEvents(messages)

    logger.info('Saved queue messages to DB')
  }

  logger.info(`Adding task to stack in ${receiveMessageTimeout} milliseconds`)

  setTimeout(runTask, receiveMessageTimeout)

  logger.info(`Added task to stack`)
}

/**
 * @import { ReceiveMessageCommandInput, ReceiveMessageResult, DeleteMessageBatchCommandOutput } from '@aws-sdk/client-sqs'
 */
