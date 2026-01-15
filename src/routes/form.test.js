import Boom from '@hapi/boom'

import { buildFormUpdateAuditRecord } from '~/src/api/forms/__stubs__/audit.js'
import { createServer } from '~/src/api/server.js'
import {
  readAuditEvents,
  readConsolidatedAuditEvents
} from '~/src/service/events.js'

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
  const badRequestStatusCode = 400
  const internalErrorStatusCode = 500
  const jsonContentType = 'application/json'
  const formId = '688131eeff67f889d52c66cc'

  describe('Success responses', () => {
    const formUpdateAuditRecord = buildFormUpdateAuditRecord()

    test('Testing GET /audit/forms/{id} route returns 200 with default pagination', async () => {
      jest.mocked(readAuditEvents).mockResolvedValueOnce({
        auditRecords: [formUpdateAuditRecord],
        totalItems: 1
      })

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        auditRecords: [formUpdateAuditRecord],
        meta: {
          pagination: {
            page: 1,
            perPage: 25,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'createdAt',
            order: 'desc'
          }
        }
      })
      expect(readAuditEvents).toHaveBeenCalledWith(
        {
          entityId: formId,
          category: 'FORM'
        },
        { page: 1, perPage: 25 }
      )
    })

    test('Testing GET /audit/forms/{id} route returns 200 with custom pagination parameters', async () => {
      jest.mocked(readAuditEvents).mockResolvedValueOnce({
        auditRecords: [formUpdateAuditRecord],
        totalItems: 50
      })

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?page=2&perPage=10`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        auditRecords: [formUpdateAuditRecord],
        meta: {
          pagination: {
            page: 2,
            perPage: 10,
            totalItems: 50,
            totalPages: 5
          },
          sorting: {
            sortBy: 'createdAt',
            order: 'desc'
          }
        }
      })
      expect(readAuditEvents).toHaveBeenCalledWith(
        {
          entityId: formId,
          category: 'FORM'
        },
        { page: 2, perPage: 10 }
      )
    })

    test('Testing GET /audit/forms/{id} route returns empty data array with pagination', async () => {
      jest.mocked(readAuditEvents).mockResolvedValueOnce({
        auditRecords: [],
        totalItems: 0
      })

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        auditRecords: [],
        meta: {
          pagination: {
            page: 1,
            perPage: 25,
            totalItems: 0,
            totalPages: 0
          },
          sorting: {
            sortBy: 'createdAt',
            order: 'desc'
          }
        }
      })
    })

    test('Testing GET /audit/forms/{id} route calculates totalPages correctly', async () => {
      jest.mocked(readAuditEvents).mockResolvedValueOnce({
        auditRecords: [formUpdateAuditRecord],
        totalItems: 25
      })

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?perPage=10`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.result).toMatchObject({
        meta: {
          pagination: {
            page: 1,
            perPage: 10,
            totalItems: 25,
            totalPages: 3
          }
        }
      })
    })

    test('Testing GET /audit/forms/{id} route with consolidate=true uses consolidated endpoint', async () => {
      const consolidatedRecord = {
        ...formUpdateAuditRecord,
        consolidatedCount: 3,
        consolidatedFrom: new Date('2025-08-07T08:00:00Z'),
        consolidatedTo: new Date('2025-08-07T10:52:22.236Z')
      }

      jest.mocked(readConsolidatedAuditEvents).mockResolvedValueOnce({
        auditRecords: [consolidatedRecord],
        totalItems: 1
      })

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?consolidate=true`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({
        auditRecords: [consolidatedRecord],
        meta: {
          pagination: {
            page: 1,
            perPage: 25,
            totalItems: 1,
            totalPages: 1
          },
          sorting: {
            sortBy: 'createdAt',
            order: 'desc'
          }
        }
      })
      expect(readConsolidatedAuditEvents).toHaveBeenCalledWith(
        {
          entityId: formId,
          category: 'FORM'
        },
        { page: 1, perPage: 25 }
      )
      expect(readAuditEvents).not.toHaveBeenCalled()
    })

    test('Testing GET /audit/forms/{id} route with consolidate=false uses regular endpoint', async () => {
      jest.mocked(readAuditEvents).mockResolvedValueOnce({
        auditRecords: [formUpdateAuditRecord],
        totalItems: 1
      })

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?consolidate=false`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(readAuditEvents).toHaveBeenCalledWith(
        {
          entityId: formId,
          category: 'FORM'
        },
        { page: 1, perPage: 25 }
      )
      expect(readConsolidatedAuditEvents).not.toHaveBeenCalled()
    })

    test('Testing GET /audit/forms/{id} route with consolidate=true and pagination', async () => {
      jest.mocked(readConsolidatedAuditEvents).mockResolvedValueOnce({
        auditRecords: [],
        totalItems: 15
      })

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?consolidate=true&page=2&perPage=5`
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.result).toMatchObject({
        meta: {
          pagination: {
            page: 2,
            perPage: 5,
            totalItems: 15,
            totalPages: 3
          }
        }
      })
      expect(readConsolidatedAuditEvents).toHaveBeenCalledWith(
        {
          entityId: formId,
          category: 'FORM'
        },
        { page: 2, perPage: 5 }
      )
    })
  })

  describe('Error responses', () => {
    test('Testing GET /audit/forms/{id} route returns 500 on service error', async () => {
      jest
        .mocked(readAuditEvents)
        .mockRejectedValue(Boom.internal('Internal error'))

      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}`
      })

      expect(response.statusCode).toEqual(internalErrorStatusCode)
    })

    test('Testing GET /audit/forms/{id} route with page less than 1 returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?page=0`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)

      const result = /** @type {{ error: string; message: string }} */ (
        response.result
      )
      expect(result.error).toBe('Bad Request')
      expect(result.message).toContain(
        '"page" must be greater than or equal to 1'
      )
    })

    test('Testing GET /audit/forms/{id} route with negative page returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?page=-1`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)

      const result = /** @type {{ error: string; message: string }} */ (
        response.result
      )
      expect(result.error).toBe('Bad Request')
      expect(result.message).toContain(
        '"page" must be greater than or equal to 1'
      )
    })

    test('Testing GET /audit/forms/{id} route with perPage less than 1 returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?perPage=0`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)

      const result = /** @type {{ error: string; message: string }} */ (
        response.result
      )
      expect(result.error).toBe('Bad Request')
      expect(result.message).toContain(
        '"perPage" must be greater than or equal to 1'
      )
    })

    test('Testing GET /audit/forms/{id} route with perPage exceeding max returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?perPage=101`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"perPage" must be less than or equal to 100'
      })
    })

    test('Testing GET /audit/forms/{id} route with non-integer page returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?page=1.5`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"page" must be an integer'
      })
    })

    test('Testing GET /audit/forms/{id} route with invalid page type returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?page=abc`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"page" must be a number'
      })
    })

    test('Testing GET /audit/forms/{id} route with invalid form ID returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit/forms/invalid-id'
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
    })

    test('Testing GET /audit/forms/{id} route with negative perPage returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?perPage=-5`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)

      const result = /** @type {{ error: string; message: string }} */ (
        response.result
      )
      expect(result.error).toBe('Bad Request')
      expect(result.message).toContain(
        '"perPage" must be greater than or equal to 1'
      )
    })

    test('Testing GET /audit/forms/{id} route with non-integer perPage returns 400', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?perPage=2.5`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"perPage" must be an integer'
      })
    })

    test('Testing GET /audit/forms/{id} route with multiple invalid parameters returns combined validation errors', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit/forms/${formId}?page=abc&perPage=-5`
      })

      expect(response.statusCode).toEqual(badRequestStatusCode)

      const result =
        /** @type {{ error: string; message: string; validation: { source: string; keys: string[] } }} */ (
          response.result
        )
      expect(result.error).toBe('Bad Request')
      expect(result.message).toContain('"page" must be a number')
      expect(result.message).toContain(
        '"perPage" must be greater than or equal to 1'
      )
      expect(result.validation.source).toBe('query')
      expect(result.validation.keys).toContain('page')
      expect(result.validation.keys).toContain('perPage')
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
