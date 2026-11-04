import {
  REFERENCE_NUMBER_HEADER,
  SESSION_ID_HEADER,
  createLogContext,
  getCorrelationId,
  getReferenceNumber,
  getSessionId,
  getUserId,
  runWithLogContext
} from '@defra/forms-common'
import hapi from '@hapi/hapi'

import {
  applyLogContextHeaders,
  applyTraceHeaders,
  getRequestUserId,
  requestTracing
} from '~/src/helpers/request-tracing.js'

describe('request-tracing', () => {
  const tracingHeader = 'x-cdp-request-id'
  const correlationId = '1066e8cc-8e1e-4671-8ad7-b4cd9c95bb94'
  const userId = '86758ba9-92e7-4287-9751-7705e449f0a5'
  const sessionId = 'c3a2e5f4-2b8e-4e1f-9a8d-3f6b7c1d2e9a'
  const referenceNumber = 'ABC-123-DEF'

  describe('plugin', () => {
    /** @type {Server} */
    let server

    beforeEach(async () => {
      server = hapi.server()

      server.auth.scheme('test', () => ({
        authenticate(request, h) {
          return h.authenticated({
            credentials: /** @type {AuthCredentials} */ (
              /** @type {unknown} */ ({ user: { oid: userId } })
            )
          })
        }
      }))
      server.auth.strategy('test', 'test')

      await server.register(requestTracing)

      server.route({
        method: 'GET',
        path: '/secure',
        handler: () => ({
          correlationId: getCorrelationId(),
          userId: getUserId(),
          sessionId: getSessionId(),
          referenceNumber: getReferenceNumber()
        }),
        options: { auth: 'test' }
      })
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should use the log context sent by the calling service', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/secure',
        headers: {
          [tracingHeader]: correlationId,
          [SESSION_ID_HEADER]: sessionId,
          [REFERENCE_NUMBER_HEADER]: referenceNumber
        }
      })

      expect(result).toEqual({
        correlationId,
        userId,
        sessionId,
        referenceNumber
      })
    })
  })

  describe('getRequestUserId', () => {
    /**
     * @param {object} auth
     */
    function buildRequest(auth) {
      return /** @type {Request} */ (/** @type {unknown} */ ({ auth }))
    }

    it('should return the oid of the user', () => {
      const request = buildRequest({
        isAuthenticated: true,
        credentials: { user: { oid: userId } }
      })

      expect(getRequestUserId(request)).toBe(userId)
    })

    it('should return undefined when the request is not authenticated', () => {
      const request = buildRequest({
        isAuthenticated: false,
        credentials: { user: { oid: userId } }
      })

      expect(getRequestUserId(request)).toBeUndefined()
    })
  })

  describe('applyTraceHeaders', () => {
    it('should add the tracing header', () => {
      runWithLogContext(createLogContext({ correlationId }), () => {
        expect(applyTraceHeaders({ accept: 'application/json' })).toEqual({
          accept: 'application/json',
          [tracingHeader]: correlationId
        })
      })
    })
  })

  describe('applyLogContextHeaders', () => {
    const context = createLogContext({
      correlationId,
      sessionId,
      referenceNumber
    })
    const headers = { accept: 'application/json' }

    it('should add the session ID and reference number for a forms service', () => {
      runWithLogContext(context, () => {
        expect(
          applyLogContextHeaders(
            new URL('http://localhost:3004/users'),
            headers
          )
        ).toEqual({
          accept: 'application/json',
          [SESSION_ID_HEADER]: sessionId,
          [REFERENCE_NUMBER_HEADER]: referenceNumber
        })
      })
    })

    it('should return the headers unchanged for a service outside forms', () => {
      runWithLogContext(context, () => {
        expect(
          applyLogContextHeaders(new URL('http://example.com/api'), headers)
        ).toBe(headers)
      })
    })
  })
})

/**
 * @import { AuthCredentials, Request, Server } from '@hapi/hapi'
 */
