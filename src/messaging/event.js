import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { sqsClient } from '~/src/messaging/sqs.js'

export const receiveMessageTimeout = config.get('receiveMessageTimeout')
const queueUrl = config.get('sqsEventsQueueUrl')
const deadLetterQueueUrl = `${queueUrl}-deadletter`
const deadLetterQueueArn = config.get('sqsEventsDlqArn')
const maxNumberOfMessages = config.get('maxNumberOfMessages')
const visibilityTimeout = config.get('visibilityTimeout')

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
    VisibilityTimeout: 5
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
