import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'prisma/**', 'scripts/**'] },
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  } },
  { files: ['src/**/*.ts'], ignores: ['**/*.test.ts'],
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
);
