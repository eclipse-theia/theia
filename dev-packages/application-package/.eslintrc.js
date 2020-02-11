/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../../configs/dev.eslintrc.json'
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'compile.tsconfig.json'
    }
};
