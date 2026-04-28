import { generateReport } from '~/src/service/metrics.js'

/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/report',
  async handler(_request, h) {
    const metrics = await generateReport()

    return h.response(metrics).code(200)
  },
  options: {
    auth: false
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
