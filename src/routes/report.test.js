import { createServer } from '~/src/api/server.js'
import { generateReport } from '~/src/service/metrics.js'
import { authSuperAdmin as auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/service/metrics.js')
jest.mock('~/src/mongo.js')
jest.mock('~/src/plugins/audit-cache.js')

describe('Report routes', () => {
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
    test('/report route returns 200', async () => {
      jest
        .mocked(generateReport)
        .mockResolvedValue({ overview: [], totals: null })

      const response = await server.inject({
        method: 'GET',
        url: '/report',
        auth
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ overview: [], totals: null })
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
