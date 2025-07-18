/* eslint-env jest */

/**
 * @type {Mocked<MongoClient>}
 */
export let client

/**
 * Prepare the database and establish a connection
 */
export function prepareDb() {
  client = /** @satisfies {MongoClient} */ ({
    startSession: () => ({
      endSession: jest.fn().mockResolvedValue(undefined),
      /* @ts-expect-error TODO: Fix types of parameters 'fn' and 'fn' are incompatible.  Type 'WithTransactionCallback<T>' is not assignable to type '() => Promise<void>'. Target signature provides too few arguments. Expected 1 or more, but got 0. */
      withTransaction: jest.fn(
        /**
         * Mock transaction handler
         * @param {() => Promise<void>} fn
         */
        async (fn) => fn()
      )
    })
  })
  return Promise.resolve()
}

/**
 * @import { MongoClient, WithTransactionCallback } from 'mongodb'
 * @import { Logger } from 'pino'
 * @import { Mocked, Mock } from 'jest-mock'
 */
