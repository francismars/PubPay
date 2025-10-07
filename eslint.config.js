import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  // Base configuration for all files
  {
    ...js.configs.recommended,
    rules: {
      ...js.configs.recommended.rules,
      // Disable no-undef globally; TypeScript handles this
      'no-undef': 'off'
    }
  },
  
  // TypeScript files configuration
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // Disable project-level type-aware linting for speed and fewer parser issues
        // project: './tsconfig.json'
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        process: 'readonly',
        NodeJS: 'readonly',
        Image: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      
      // General rules
      'no-console': 'off', // Disabled for now - lots of console statements
      'no-debugger': 'error',
      // In TS projects, no-undef is handled by the TS compiler
      'no-undef': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      
      // Code style (use Prettier for formatting; disable core indent which is unstable in TSX)
      'indent': 'off',
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      'no-trailing-spaces': 'error',
      'eol-last': 'error'
    }
  },
  // Type definition files
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  
  // Ignore patterns
  {
    ignores: [
      'dist/',
      'node_modules/',
      'public/',
      '*.js',
      'webpack.config.js',
      'eslint.config.js'
    ]
  }
];
