import { getJson } from '~/src/lib/fetch.js'

/**
 * Wrapper for easy mocking of this call
 * @param {URL} url - target URL
 */
export async function getJsonFromManager(url) {
  const res = await getJson(url, {})
  return res
}

/**
 * Wrapper for easy mocking of this call
 * @param {URL} url - target URL
 */
export async function getJsonFromSubmissions(url) {
  const res = await getJson(url, {})
  return res
}
