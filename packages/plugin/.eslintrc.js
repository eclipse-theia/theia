/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../../configs/build.eslintrc.json'
    ],
    ignorePatterns: [
        'src/theia.d.ts'
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'compile.tsconfig.json'
    }
};
