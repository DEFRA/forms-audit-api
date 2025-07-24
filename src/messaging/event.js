import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand
} from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { sqsClient } from '~/src/tasks/sqs.js'

export const receiveMessageTimeout = config.get('receiveMessageTimeout')
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
 * @param {Message[]} messages
 * @returns {Promise<DeleteMessageBatchCommandOutput>}
 */
export function deleteEventMessages(messages) {
  const command = new DeleteMessageBatchCommand({
    QueueUrl: queueUrl,
    Entries: messages.map((message) => ({
      Id: message.MessageId,
      ReceiptHandle: message.ReceiptHandle
    }))
  })

  return sqsClient.send(command)
}

/**
 * @import { ReceiveMessageCommandInput, ReceiveMessageResult, DeleteMessageBatchCommandOutput, Message } from '@aws-sdk/client-sqs'
 */
