import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'android/**', 'ios/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  } },
  { files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'hooks/**/*.ts', 'services/**/*.ts', 'stores/**/*.ts'],
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    plugins: { 'react-hooks': hooks },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
);
