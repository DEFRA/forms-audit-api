import { checkError } from '~/src/helpers/payload-fail-action.js'

describe('payloadFailAction', () => {
  test('returns error if not Boom or Joi', () => {
    const error = new Error('Test error message')
    expect(checkError(error)).toBe(error)
  })

  test('returns new error if no error found', () => {
    expect(checkError(undefined).message).toBe('Unknown error')
  })
})
