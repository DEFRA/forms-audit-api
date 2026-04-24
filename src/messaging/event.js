import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { sqsClient } from '~/src/messaging/sqs.js'

export const receiveMessageTimeout = config.get('receiveMessageTimeout')
const queueUrl = config.get('sqsEventsQueueUrl')
const deadLetterQueueUrl = `${queueUrl}-deadletter`
const deadLetterQueueArn = config.get('sqsEventsDlqArn')
const maxNumberOfMessages = config.get('maxNumberOfMessages')
const visibilityTimeout = config.get('visibilityTimeout')

const logger = createLogger()

/**
 * @type {ReceiveMessageCommandInput}
 */
const input = {
  QueueUrl: queueUrl,
  MaxNumberOfMessages: maxNumberOfMessages,
  VisibilityTimeout: visibilityTimeout
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
 * Receive dead-letter queue messages
 * @returns {Promise<ReceiveMessageResult>}
 */
export function receiveDlqMessages() {
  const command = new ReceiveMessageCommand({
    QueueUrl: deadLetterQueueUrl,
    MaxNumberOfMessages: 10,
    VisibilityTimeout: 0,
    WaitTimeSeconds: 0
  })
  return sqsClient.send(command)
}

/**
 * Redrive the specified message from the dead-letter queue to the main queue
 * @returns {Promise<StartMessageMoveTaskResult>}
 */
export function redriveDlqMessages() {
  const command = new StartMessageMoveTaskCommand({
    SourceArn: deadLetterQueueArn
  })
  return sqsClient.send(command)
}

/**
 * Delete DLQ message by messageId
 * This has to be done as a combined 'read then delete' (while using a visibility timeout of non-zero)
 * otherwise the receipt handles become stale and the delete operation doesn't work.
 * @param {string} messageId
 */
export async function deleteDlqMessage(messageId) {
  const receiveCommand = new ReceiveMessageCommand({
    QueueUrl: deadLetterQueueUrl,
    MaxNumberOfMessages: 10,
    VisibilityTimeout: 2,
    WaitTimeSeconds: 0
  })
  const messageResponse = await sqsClient.send(receiveCommand)

  const messages = messageResponse.Messages
    ? messageResponse.Messages.filter((m) => m.MessageId === messageId)
    : undefined
  if (!messages?.length) {
    const errorText = `Message with id ${messageId} not found in audit-api DLQ`
    logger.info(errorText)
    throw new Error(errorText)
  }

  logger.info(
    `[DLQ] Number of messages found with id ${messageId}: ${messages.length}`
  )
  for (const message of messages) {
    const deleteCommand = new DeleteMessageCommand({
      QueueUrl: deadLetterQueueUrl,
      ReceiptHandle: message.ReceiptHandle
    })
    logger.info(`[DLQ] Deleting message with id ${messageId}`)
    await sqsClient.send(deleteCommand)
    logger.info(`[DLQ] Deleted message with id ${messageId}`)
  }
}

/**
 * Delete event message
 * @param {Message} message
 * @returns {Promise<DeleteMessageCommandOutput>}
 */
export function deleteEventMessage(message) {
  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: message.ReceiptHandle
  })

  return sqsClient.send(command)
}

/**
 * @import { ReceiveMessageCommandInput, ReceiveMessageResult, DeleteMessageCommandOutput, Message, StartMessageMoveTaskResult } from '@aws-sdk/client-sqs'
 */
