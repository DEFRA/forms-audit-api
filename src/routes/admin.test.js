import { createServer } from '~/src/api/server.js'
import {
  deleteDlqMessage,
  getDlqMessage,
  receiveDlqMessages,
  redriveDlqMessages,
  resubmitDlqMessage
} from '~/src/messaging/event.js'
import { authSuperAdmin as auth } from '~/test/fixtures/auth.js'

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

    test('/admin/dead-letter/view/message-id route returns 200', async () => {
      jest.mocked(getDlqMessage).mockResolvedValue({ MessageId: 'message1' })

      const response = await server.inject({
        method: 'GET',
        url: '/admin/deadletter/view/message1',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: { MessageId: 'message1' } })
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

    test('/admin/dead-letter/resubmit route returns 200', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/admin/deadletter/resubmit/12345',
        auth,
        payload: {
          messageJson: {}
        }
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: 'success' })
      expect(resubmitDlqMessage).toHaveBeenCalled()
    })
  })

  describe('DELETE', () => {
    test('/admin/dead-letter/message-id route returns 200', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/admin/deadletter/message-id',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: 'success' })
      expect(deleteDlqMessage).toHaveBeenCalledWith(
        'message-id',
        undefined,
        undefined
      )
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
