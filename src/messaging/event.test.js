import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  SQSClient
} from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'

import 'aws-sdk-client-mock-jest'
import {
  deleteEventMessages,
  receiveEventMessages
} from '~/src/messaging/event.js'

describe('event', () => {
  const snsMock = mockClient(SQSClient)
  const messageId = '31cb6fff-8317-412e-8488-308d099034c4'
  const receiptHandle = 'YzAwNzQ3MGMtZGY5Mi0'
  const messageStub = {
    Body: 'hello world',
    MD5OfBody: '9e5729d418a527676ab6807b35c6ffb1',
    MessageId: messageId,
    ReceiptHandle: receiptHandle
  }
  afterEach(() => {
    snsMock.reset()
  })
  describe('receiveEventMessages', () => {
    it('should send messages', async () => {
      const receivedMessage = {
        Messages: [messageStub]
      }
      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await expect(receiveEventMessages()).resolves.toEqual(receivedMessage)
    })
  })

  describe('deleteEventMessages', () => {
    it('should delete event messages', async () => {
      /**
       * @type {DeleteMessageBatchResult}
       */
      const deleteBatchResult = {
        Successful: [{ Id: messageId }],
        Failed: []
      }
      snsMock.on(DeleteMessageBatchCommand).resolves(deleteBatchResult)
      await deleteEventMessages([messageStub])
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageBatchCommand, {
        QueueUrl: expect.stringContaining('forms_audit_events'),
        Entries: [
          {
            Id: messageId,
            ReceiptHandle: receiptHandle
          }
        ]
      })
    })
  })
})

/**
 * @import {DeleteMessageBatchResult} from '@aws-sdk/client-sqs'
 */
