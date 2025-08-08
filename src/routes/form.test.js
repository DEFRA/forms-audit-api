import Boom from '@hapi/boom'
import { ValidationError } from 'joi'

import { buildFormUpdateAuditRecord } from '~/src/api/forms/__stubs__/audit.js'
import {
  ApplicationError,
  InvalidFormDefinitionError
} from '~/src/api/forms/errors.js'
import { createServer } from '~/src/api/server.js'
import { readAuditEvents } from '~/src/service/events.js'

jest.mock('~/src/service/events.js')

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
  const badRequestErrorStatusCode = 400
  const internalErrorStatusCode = 500
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

    test('Testing GET /audit/forms/{id} route returns InvalidFormDefinitionError', async () => {
      const invalidFormDefinitionError = new InvalidFormDefinitionError(
        new ValidationError('bad payload', [], { obj: true })
      )
      jest.mocked(readAuditEvents).mockRejectedValue(invalidFormDefinitionError)

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}`
      })
      expect(response.statusCode).toBe(badRequestErrorStatusCode)
    })

    test('Testing GET /audit/forms/{id} route returns ApplicationError', async () => {
      const invalidFormDefinitionError = new ApplicationError('internal errro')
      jest.mocked(readAuditEvents).mockRejectedValue(invalidFormDefinitionError)

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}`
      })
      expect(response.statusCode).toBe(internalErrorStatusCode)
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
