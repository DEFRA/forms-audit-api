import { ApplicationError } from '~/src/api/forms/errors.js'

describe('errors', () => {
  describe('ApplicationError', () => {
    it('should add status code if supplied', () => {
      const error = new ApplicationError('Conflict', { statusCode: 409 })
      expect(error.statusCode).toBe(409)
    })
  })
})
