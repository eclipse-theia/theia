/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../../configs/build.eslintrc.json'
    ],
    ignores: [
        "./src/browser-only/plugin-sample/example-static-plugin-metadata.ts" // Ignoring this file as it only contains static metadata
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'tsconfig.json'
    }
};
