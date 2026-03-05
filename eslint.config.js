import prettierConfig from 'eslint-config-prettier'
import jestPlugin from 'eslint-plugin-jest'
import jsdocPlugin from 'eslint-plugin-jsdoc'
import globals from 'globals'
import neostandard from 'neostandard'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      '.server',
      'src/__fixtures__',
      'coverage',
      'node_modules',
      'node_modules/.*'
    ]
  },

  ...neostandard({ ts: true, noStyle: true }),

  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsdocPlugin.configs['flat/recommended'],

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      'no-console': 'error',

      // Don't show eslint warnings for types - let TS handle
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // Check type support for template string implicit `.toString()`
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true
        }
      ],

      // Skip rules handled by TypeScript compiler
      'import-x/default': 'off',
      'import-x/extensions': 'off',
      'import-x/named': 'off',
      'import-x/namespace': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-unresolved': 'off',

      // Check import or require statements are A-Z ordered
      'import-x/order': [
        'error',
        {
          alphabetize: { order: 'asc' },
          named: true,
          'newlines-between': 'always'
        }
      ],

      // Check relative import paths use aliases
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./', '../'],
              message: "Please use '~/*' import alias instead."
            }
          ]
        }
      ],

      // Check for valid formatting
      'jsdoc/check-line-alignment': [
        'warn',
        'never',
        {
          tags: ['param', 'property', 'typedef', 'returns']
        }
      ],

      // Require hyphens before param description
      // Aligns with TSDoc style: https://tsdoc.org/pages/tags/param/
      'jsdoc/require-hyphen-before-param-description': [
        'warn',
        'always',
        {
          tags: {
            param: 'always',
            property: 'always',
            returns: 'never'
          }
        }
      ],

      // JSDoc blocks are mandatory for classes and methods
      'jsdoc/require-jsdoc': [
        'error',
        {
          enableFixer: false,
          require: {
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionExpression: false,
            MethodDefinition: true
          }
        }
      ],

      // JSDoc @param types are mandatory for JavaScript
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-param': 'off',

      // JSDoc @returns is optional
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-returns': 'off',

      // Skip rules handled by TypeScript compiler
      'n/no-extraneous-require': 'off',
      'n/no-extraneous-import': 'off',
      'n/no-missing-require': 'off',
      'n/no-missing-import': 'off',

      // Prefer rules that are type aware
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-unused-vars': ['error'],
      '@typescript-eslint/no-use-before-define': ['error', 'nofunc']
    }
  },

  // JS-specific override with recommended-typescript-flavor for JSDoc
  {
    files: ['**/*.{js,mjs}'],
    ...jsdocPlugin.configs['flat/recommended-typescript-flavor'],
    rules: {
      ...jsdocPlugin.configs['flat/recommended-typescript-flavor'].rules,

      // Preserve base rule overrides
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-returns': 'off',

      'import-x/extensions': [
        'error',
        'always',
        {
          ignorePackages: true,
          pattern: {
            cjs: 'always',
            js: 'always',
            mjs: 'always'
          }
        }
      ]
    }
  },

  // CJS override (allow require imports)
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },

  // ESM source type override
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module'
    }
  },

  // Jest override for test files
  {
    files: [
      '**/*.test.{cjs,js,mjs}',
      '**/__stubs__/*.{cjs,js,mjs}',
      '**/__mocks__/*.{cjs,js,mjs}'
    ],
    ...jestPlugin.configs['flat/recommended'],
    ...jestPlugin.configs['flat/style'],
    languageOptions: {
      globals: globals.jest
    },
    plugins: {
      jest: jestPlugin
    },
    rules: {
      ...jestPlugin.configs['flat/recommended'].rules,
      ...jestPlugin.configs['flat/style'].rules,

      // Turn off warnings for jest.Expect 'any' types
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Allow Jest to assert on mocked unbound methods
      '@typescript-eslint/unbound-method': 'off',
      'jest/unbound-method': 'error'
    }
  },

  prettierConfig
]
