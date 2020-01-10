/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../../configs/build.eslintrc.json'
    ],
    ignorePatterns: [
        'download/' // Somehow ESLint *wants* to lint this folder?
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'compile.tsconfig.json'
    }
};
