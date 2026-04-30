import { createServer } from '~/src/api/server.js'
import { config } from '~/src/config/index.js'
import { getErrorMessage } from '~/src/helpers/error-message.js'
import { logger } from '~/src/helpers/logging/logger.js'

process.on('unhandledRejection', (err) => {
  logger.error(
    err,
    `[unhandledRejection] Unhandled rejection - ${getErrorMessage(err)}`
  )
  throw err
})

/**
 * Starts the server.
 */
export async function listen() {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )
}
