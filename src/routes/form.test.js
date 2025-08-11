import { buildFormUpdateAuditRecord } from '~/src/api/forms/__stubs__/audit.js'
import { createServer } from '~/src/api/server.js'
import { readAuditEvents } from '~/src/service/events.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/service/events.js')
jest.mock('~/src/helpers/logging/logger.js')

describe('Forms audit route', () => {
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
  const formId = '688131eeff67f889d52c66cc'

  describe('Success responses', () => {
    test('Testing GET /audit/forms/{id} route returns 200', async () => {
      const formUpdateAuditRecord = buildFormUpdateAuditRecord()

      jest
        .mocked(readAuditEvents)
        .mockResolvedValueOnce([formUpdateAuditRecord])

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject([formUpdateAuditRecord])
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
