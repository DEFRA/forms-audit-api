import { failAction } from '~/src/helpers/fail-action.js'

/**
 * GPT generated
 */
describe('failAction', () => {
  it('logs and throws the error if it is an instance of Error', () => {
    const error = new Error('Test error')
    // @ts-expect-error - no request
    expect(() => failAction({}, {}, error)).toThrow(error)
  })

  it('logs and throws a new Error if error is not an instance of Error', () => {
    const error = 'String error'
    // @ts-expect-error - no request
    expect(() => failAction({}, {}, error)).toThrow(new Error('String error'))
  })

  it('logs and throws a new Error if error is null', () => {
    const error = null
    // @ts-expect-error - no request
    expect(() => failAction({}, {}, error)).toThrow(new Error('null'))
  })

  it('logs and throws a new Error if error is undefined', () => {
    let error
    // @ts-expect-error - no request
    expect(() => failAction({}, {}, error)).toThrow(new Error('undefined'))
  })
})
