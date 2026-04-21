import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'

import 'aws-sdk-client-mock-jest'
import {
  deleteDlqMessage,
  deleteEventMessage,
  receiveDlqMessages,
  receiveEventMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'

jest.mock('~/src/helpers/logging/logger.js')

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

  describe('deleteEventMessage', () => {
    it('should delete event message', async () => {
      /**
       * @type {DeleteMessageCommandOutput}
       */
      const deleteResult = {
        $metadata: {}
      }

      snsMock.on(DeleteMessageCommand).resolves(deleteResult)
      await deleteEventMessage(messageStub)
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: expect.any(String),
        ReceiptHandle: receiptHandle
      })
    })
  })

  describe('receiveDlqMessages', () => {
    it('should receive dead-letter queue messages', async () => {
      const receivedMessage = {
        Messages: [messageStub]
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await receiveDlqMessages()
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        VisibilityTimeout: 0,
        WaitTimeSeconds: 0
      })
    })
  })

  describe('redriveDlqMessages', () => {
    it('should redrive dead-letter queue messages', async () => {
      /**
       * @type {StartMessageMoveTaskCommandOutput}
       */
      const redriveResult = {
        TaskHandle: '123',
        $metadata: {}
      }

      snsMock.on(StartMessageMoveTaskCommand).resolves(redriveResult)
      await redriveDlqMessages()
      expect(snsMock).toHaveReceivedCommandWith(StartMessageMoveTaskCommand, {
        SourceArn: expect.any(String)
      })
    })
  })

  describe('deleteDlqMessage', () => {
    it('should delete event message', async () => {
      const receivedMessage = {
        Messages: [messageStub, messageStub, messageStub]
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await deleteDlqMessage(messageStub.MessageId)
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 2,
        WaitTimeSeconds: 0
      })
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: expect.any(String),
        ReceiptHandle: receiptHandle
      })
    })

    it('should throw if message not found', async () => {
      const receivedMessage = {
        Messages: []
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await expect(() =>
        deleteDlqMessage(messageStub.MessageId)
      ).rejects.toThrow(
        'Message with id 31cb6fff-8317-412e-8488-308d099034c4 not found in audit-api DLQ'
      )
    })
  })
})

/**
 * @import { DeleteMessageCommandOutput, StartMessageMoveTaskCommandOutput } from '@aws-sdk/client-sqs'
 */
