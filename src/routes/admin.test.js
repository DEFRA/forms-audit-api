import { createServer } from '~/src/api/server.js'
import {
  deleteDlqMessage,
  receiveDlqMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'
import { authSuperAdmin as auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/plugins/audit-cache.js')
jest.mock('~/src/messaging/event.js')

describe('Admin routes', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  const okStatusCode = 200
  const jsonContentType = 'application/json'

  describe('GET', () => {
    test('/admin/dead-letter/view route returns 200', async () => {
      jest
        .mocked(receiveDlqMessages)
        .mockResolvedValue({ Messages: [{ MessageId: 'message1' }] })

      const response = await server.inject({
        method: 'GET',
        url: '/admin/deadletter/view',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ messages: [{ MessageId: 'message1' }] })
    })
  })

  describe('POST', () => {
    test('/admin/dead-letter/redrive route returns 200', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/admin/deadletter/redrive',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: 'success' })
      expect(redriveDlqMessages).toHaveBeenCalled()
    })
  })

  describe('DELETE', () => {
    test('/admin/dead-letter/receiptHandle route returns 200', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/admin/deadletter/receipt-handle',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: 'success' })
      expect(deleteDlqMessage).toHaveBeenCalled()
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
