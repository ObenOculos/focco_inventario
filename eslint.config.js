import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `supabase/.temp` é metadado da CLI, não código do projeto: dentro dele vem o runtime
  // das Edge Functions MINIFICADO, e era ele que respondia por ~195 dos ~205 problemas de
  // lint — `prefer-const` e `no-var` sobre variáveis de uma letra. Ruído desse tamanho não
  // esconde um erro nosso, ele enterra. O `dist` entra pelo mesmo motivo, e já estava aqui.
  { ignores: ['dist', 'supabase/.temp'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
