import Boom from '@hapi/boom'
import Wreck from '@hapi/wreck'

const MIN_OK_STATUS = 200
const MAX_OK_STATUS = 299

const NOT_FOUND = 404

/**
 * Base request function using @hapi/wreck
 * @param {string} method - HTTP method
 * @param {URL} url - URL object
 * @param {object} options - Request options
 * @returns {Promise<{response: object, body: any}>}
 */
export async function request(method, url, options) {
  const response = await Wreck.request(method, url.href, options)
  const body = await Wreck.read(response, options)
  const statusCode = response.statusCode

  if (!statusCode || statusCode < MIN_OK_STATUS || statusCode > MAX_OK_STATUS) {
    let err

    if ('message' in body && typeof body.message === 'string' && body.message) {
      const cause = 'cause' in body ? body.cause : undefined
      err = new Error(body.message, { cause })
    } else {
      err = new Error(`HTTP status code ${statusCode}`)
    }

    throw Boom.boomify(err, { statusCode, data: body })
  }

  return { response, body }
}

/**
 * GET request
 * @param {URL} url - URL object
 * @param {object} options - Request options
 * @returns {Promise<{response: object, body: any}>}
 */
export function get(url, options) {
  return request('get', url, options)
}

/**
 * POST request
 * @param {URL} url - URL object
 * @param {object} options - Request options
 * @returns {Promise<{response: object, body: any}>}
 */
export function post(url, options) {
  return request('post', url, options)
}

/**
 * GET request with JSON parsing
 * @param {URL} url - URL object
 * @param {object} options - Request options
 * @returns {Promise<{response: object, body: any}>}
 */
export function getJson(url, options = {}) {
  return get(url, { json: true, ...options })
}

/**
 * GET request with JSON parsing
 * @param {URL} url - URL object
 * @param {object} options - Request options
 * @returns {Promise<{response: object, body: any}>}
 */
export async function getJsonIgnoreMissing(url, options = {}) {
  try {
    return await get(url, { json: true, ...options })
  } catch (err) {
    const error = /** @type {{ data?: { statusCode: number }}} */ (err)
    if (error.data?.statusCode !== NOT_FOUND) {
      throw err
    }
  }
  return { body: undefined, response: { statusCode: NOT_FOUND } }
}

/**
 * POST request with JSON parsing
 * @param {URL} url - URL object
 * @param {object} options - Request options
 * @returns {Promise<{response: object, body: any}>}
 */
export function postJson(url, options = {}) {
  return post(url, { json: true, ...options })
}
