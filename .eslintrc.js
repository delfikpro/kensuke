module.exports = {
    env: {
        es2021: true,
        node: true,
    },
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module',
    },
    plugins: ['@typescript-eslint', 'prettier'],
    rules: {
        indent: ['warn', 4],
        quotes: ['warn', 'single', { allowTemplateLiterals: true }],
        semi: ['warn', 'always'],
        'eol-last': ['warn'],
        'no-duplicate-imports': ['error'],
        'no-multi-spaces': ['warn'],
        '@typescript-eslint/no-explicit-any': ['off'],
        '@typescript-eslint/ban-ts-comment': ['off'],
        '@typescript-eslint/explicit-module-boundary-types': ['off'],
        'prettier/prettier': ['warn'],
    },
};
