/* istanbul ignore file */
/**
 * @type {import('pino').Logger}
 */
export const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn().mockReturnThis()
}
