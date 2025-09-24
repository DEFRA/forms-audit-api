import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Log and throw an error
 * @type {Lifecycle.Method}
 */
export const failAction = (_request, _h, err) => {
  logger.error(
    err,
    `[validationFailed] Request validation failed - ${getErrorMessage(err)}`
  )

  throw err instanceof Error ? err : new Error(String(err))
}

/**
 * @import { Lifecycle } from '@hapi/hapi'
 */
