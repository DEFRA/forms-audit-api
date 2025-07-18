import { escapeRegExp } from '~/src/helpers/string-utils.js'

describe('String Utils', () => {
  describe('escapeRegExp', () => {
    const testCases = [
      {
        input: 'hello world',
        expected: 'hello world',
        description: 'should not modify strings without special characters'
      },
      {
        input: '.*+?^${}()|[]\\',
        expected: '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
        description: 'should escape all special regex characters'
      },
      {
        input: 'user.input*with^special$chars',
        expected: 'user\\.input\\*with\\^special\\$chars',
        description: 'should escape special characters within regular text'
      },
      {
        input: '',
        expected: '',
        description: 'should handle empty strings'
      },
      {
        input: '\\already\\escaped\\',
        expected: '\\\\already\\\\escaped\\\\',
        description: 'should escape backslashes'
      }
    ]

    test.each(testCases)('$description', ({ input, expected }) => {
      expect(escapeRegExp(input)).toBe(expected)
    })
  })
})
