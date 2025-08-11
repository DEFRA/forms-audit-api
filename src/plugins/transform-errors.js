import Boom from '@hapi/boom'

/**
 * @satisfies {Plugin<void>}
 */
export const transformErrors = {
  name: 'transform-errors',
  register(server) {
    server.ext('onPreResponse', (request, h) => {
      const response = request.response

      if (Boom.isBoom(response)) {
        response.output.payload.custom = response.data
      }

      return h.continue
    })
  }
}

/**
 * @import { Plugin } from '@hapi/hapi'
 */
