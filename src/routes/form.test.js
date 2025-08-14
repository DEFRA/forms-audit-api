import Boom from '@hapi/boom'

import { buildFormUpdateAuditRecord } from '~/src/api/forms/__stubs__/audit.js'
import { createServer } from '~/src/api/server.js'
import { readAuditEvents } from '~/src/service/events.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/service/events.js')
jest.mock('~/src/helpers/logging/logger.js')
jest.mock('~/src/tasks/receive-messages.js')

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
  const internalErrorStatusCode = 500
  const jsonContentType = 'application/json'
  const formId = '688131eeff67f889d52c66cc'

  describe('Success responses', () => {
    const formUpdateAuditRecord = buildFormUpdateAuditRecord()

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
      expect(response.result).toMatchObject({
        auditRecords: [formUpdateAuditRecord],
        skip: 0
      })
      expect(readAuditEvents).toHaveBeenCalledWith(
        {
          entityId: formId,
          category: 'FORM'
        },
        0
      )
    })

    test('Testing GET /audit/forms/{id} route returns 200 with skip parameter', async () => {
      jest
        .mocked(readAuditEvents)
        .mockResolvedValueOnce([formUpdateAuditRecord])

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?skip=20`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toMatchObject({
        auditRecords: [formUpdateAuditRecord],
        skip: 20
      })
      expect(readAuditEvents).toHaveBeenCalledWith(
        {
          entityId: formId,
          category: 'FORM'
        },
        20
      )
    })

    test('Testing GET /audit/forms/{id} route returns 500', async () => {
      jest
        .mocked(readAuditEvents)
        .mockRejectedValue(Boom.internal('Internal error'))

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}`
      })
      expect(response.statusCode).toEqual(internalErrorStatusCode)
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
