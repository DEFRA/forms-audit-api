import { getTraceId } from '@defra/hapi-tracing'

import { loggerOptions } from '~/src/helpers/logging/logger-options.js'

jest.mock('@defra/hapi-tracing')

describe('logger-options', () => {
  it('should be reusable', () => {
    expect(loggerOptions.mixin()).toEqual({})
  })

  it('should use trace id', () => {
    const traceId = '1066e8cc-8e1e-4671-8ad7-b4cd9c95bb94'
    jest.mocked(getTraceId).mockReturnValue(traceId)
    expect(loggerOptions.mixin()).toEqual({ trace: { id: traceId } })
  })
})
