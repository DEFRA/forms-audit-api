import { requestLogger } from '~/src/helpers/logging/request-logger.js'

describe('request-logger', () => {
  it('should log requests', () => {
    const oid = '9c145f66-0ce8-435f-a6aa-f1f0041baebc'
    expect(
      requestLogger.options.customRequestCompleteMessage(
        {
          method: 'GET',
          path: '/audit/forms/12121212',
          raw: {
            res: {
              statusCode: 200
            }
          },
          auth: {
            isAuthenticated: true,
            credentials: {
              user: {
                oid
              }
            }
          }
        },
        20
      )
    ).toBe(
      '[response] [9c145f66-0ce8-435f-a6aa-f1f0041baebc]  GET /audit/forms/12121212 200 (20ms)'
    )
  })

  it('should log requests 2', () => {
    expect(
      requestLogger.options.customRequestCompleteMessage(
        {
          method: 'GET',
          path: '/audit/forms/12121212',
          raw: {
            res: {
              statusCode: 200
            }
          },
          auth: {
            isAuthenticated: true,
            credentials: {
              user: {}
            }
          }
        },
        20
      )
    ).toBe('[response] GET /audit/forms/12121212 200 (20ms)')
  })
})
