import { ReceiveMessageCommand } from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { sqsClient } from '~/src/tasks/sqs.js'

/**
 * @type {ReceiveMessageCommandInput}
 */
const input = {
  QueueUrl: config.get('sqsEventsQueueUrl'),
  MaxNumberOfMessages: 10,
  WaitTimeSeconds: 1
}

export function receiveEventMessages() {
  const queue = new ReceiveMessageCommand(input)
}

/**
 * @import { ReceiveMessageCommandInput } from '@aws-sdk/client-sqs'
 */
