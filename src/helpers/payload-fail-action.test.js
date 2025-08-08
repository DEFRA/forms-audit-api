import Boom from '@hapi/boom'
import { ValidationError } from 'joi'

import { InvalidFormDefinitionError } from '~/src/api/forms/errors.js'
import { checkError, failAction } from '~/src/helpers/payload-fail-action.js'

/**
 * contains GPT generated tests
 */
describe('payloadFailAction', () => {
  describe('checkError', () => {
    it('returns error if not Boom or Joi', () => {
      const error = new Error('Test error message')
      expect(checkError(error)).toBe(error)
    })

    it('returns new error if no error found', () => {
      expect(checkError(undefined).message).toBe('Unknown error')
    })

    it('throws InvalidFormDefinitionError if Boom and Joi error with payload source', () => {
      const boomError = Boom.badRequest(
        new ValidationError('bad payload', [], { obj: true })
      )
      // Simulate validation source
      boomError.output.payload.validation = { source: 'payload' }
      expect(() => checkError(boomError)).toThrow(InvalidFormDefinitionError)
      boomError.output.payload.validation = undefined
      expect(checkError(boomError)).toBe(boomError)
    })

    it('returns error if Boom and Joi error but not payload source', () => {
      const boomError = Boom.badRequest('bad payload')

      boomError.output.payload.validation = { source: 'query' }
      expect(checkError(boomError)).toBe(boomError)
    })

    it('returns error if Boom and Joi error but no validation', () => {
      const boomError = Boom.badRequest('bad payload')
      // No validation property
      expect(checkError(boomError)).toBe(boomError)
    })
  })

  describe('failAction', () => {
    it('logs error and returns result of checkError', () => {
      const err = new Error('fail')
      // @ts-expect-error - no request
      const result = failAction({}, {}, err)

      expect(result).toEqual(err)
    })
  })
})
