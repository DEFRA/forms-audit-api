import { getErrorMessage } from '@defra/forms-model'
import Jwt from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { getUserScopes } from '~/src/service/entitlements/service.js'

const oidcJwksUri = config.get('oidcJwksUri')
const oidcVerifyAud = config.get('oidcVerifyAud')
const oidcVerifyIss = config.get('oidcVerifyIss')

const logger = createLogger()

/**
 * Processes the groups claim from the token payload
 * @param {unknown} groupsClaim - The groups claim from the token
 * @param {string} oid - User OID for logging purposes
 * @returns {string[]} Processed groups array
 */
function processGroupsClaim(groupsClaim, oid) {
  let processedGroups = []

  // For the integration tests, the OIDC mock server sends the 'groups' claim as a stringified JSON array which
  // requires parsing, while a real Azure AD would typically provide 'groups' as a proper array.
  // We handle both formats for flexibility between test and production environments.
  if (typeof groupsClaim === 'string') {
    try {
      const parsed = JSON.parse(groupsClaim)
      if (Array.isArray(parsed)) {
        processedGroups = parsed
      } else {
        logger.warn(
          `[authGroupsInvalid] Auth: User ${oid}: 'groups' claim was string but not valid JSON array: '${groupsClaim}'`
        )
      }
    } catch (err) {
      logger.error(
        err,
        `[authGroupsParseError] Auth: User ${oid}: Failed to parse 'groups' claim - ${getErrorMessage(err)}`
      )
    }
  } else if (Array.isArray(groupsClaim)) {
    processedGroups = groupsClaim
  } else {
    processedGroups = []
  }

  return processedGroups
}

/**
 * Validates user credentials from JWT token
 * @param {Artifacts<UserCredentials>} artifacts - JWT artifacts
 * @returns {Promise<{ isValid: boolean, credentials?: any }>} Validation result
 */
async function validateUserCredentials(artifacts) {
  const user = artifacts.decoded.payload

  if (!user) {
    logger.info('[authMissingUser] Auth: Missing user from token payload.')
    return {
      isValid: false
    }
  }

  const { oid } = user
  const groupsClaim = user.groups

  if (!oid) {
    logger.info('[authMissingOID] Auth: User OID is missing in token payload.')
    return {
      isValid: false
    }
  }

  const processedGroups = processGroupsClaim(groupsClaim, oid)

  const authToken = artifacts.token
  const userScopes = await getUserScopes(oid, authToken)

  return {
    isValid: true,
    credentials: {
      user: {
        ...user,
        groups: processedGroups
      },
      scope: userScopes
    }
  }
}

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const auth = {
  plugin: {
    name: 'auth',
    async register(server) {
      await server.register(Jwt)

      server.auth.strategy('azure-oidc-token', 'jwt', {
        keys: {
          uri: oidcJwksUri
        },
        verify: {
          aud: oidcVerifyAud,
          iss: oidcVerifyIss,
          sub: false,
          nbf: true,
          exp: true
        },
        validate: validateUserCredentials
      })

      // Set as the default strategy
      server.auth.default('azure-oidc-token')
    }
  }
}

/**
 * @import { ServerRegisterPluginObject, UserCredentials } from '@hapi/hapi'
 * @import { Artifacts } from '~/src/plugins/auth/types.js'
 */
