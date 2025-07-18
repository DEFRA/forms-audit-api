import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Log and throw an error
 * @type {Lifecycle.Method}
 */
export const failAction = (_request, _h, error) => {
  logger.error(
    `[validationFailed] Request validation failed - ${getErrorMessage(error)}`
  )

  throw error instanceof Error ? error : new Error(String(error))
}

/**
 * @import { Lifecycle } from '@hapi/hapi'
 */
