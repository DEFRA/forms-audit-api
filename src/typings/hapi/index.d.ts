export {}
declare module '@hapi/hapi' {
  interface AuthCredentials {
    provider: 'azure-oidc'
    query: StringLikeMap
    token: string
    idToken: string
    refreshToken: string
    expiresIn: number
    flowId: string
    scope?: string[]
  }

  interface UserCredentials {
    /**
     * User ID
     */
    id: UserProfile['sub']

    /**
     * User email address
     */
    email: UserProfile['email']

    /**
     * User display name
     */
    displayName: string

    /**
     * User roles from entitlement API
     */
    roles?: string[]

    /**
     * User scopes from entitlement API
     */
    scopes?: string[]

    /**
     * Session issued time (ISO 8601)
     */
    issuedAt?: string

    /**
     * Session expiry time (ISO 8601)
     */
    expiresAt?: string

    /**
     * Unique id for user
     */
    oid?: string

    /**
     * Group ids that the user is assigned to
     */
    groups?: string[]
  }
}
