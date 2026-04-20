import nock from 'nock'

const jwksUri = process.env.OIDC_JWKS_URI
const okStatusCode = 200

const testJwks = {
  keys: [
    {
      kty: 'RSA',
      use: 'sig',
      kid: 'test-jwks-key',
      alg: 'RS256',
      n: 'test-key-modulus',
      e: 'AQAB'
    }
  ]
}

if (jwksUri) {
  const { origin, pathname, search } = new URL(jwksUri)

  nock.cleanAll()

  nock(origin)
    .persist()
    .get(`${pathname}${search}`)
    .reply(okStatusCode, testJwks)
}
