/**
 * @returns {Logger<never, boolean>}
 */
export function createLogger() {
  // @ts-expect-error - stub only for tests
  return /** @type {Logger<never, boolean>} */ ({
    info: jest.fn(),
    level: '1',
    fatal: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    silent: jest.fn(),
    warn: jest.fn()
  })
}

/**
 * @import { Logger } from 'pino'
 */
