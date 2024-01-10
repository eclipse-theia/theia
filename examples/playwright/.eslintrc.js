/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../../configs/build.eslintrc.json'
    ],
    ignorePatterns: ['playwright.config.ts'],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'tsconfig.json',
        // suppress warning from @typescript-eslint/typescript-estree plugin
        warnOnUnsupportedTypeScriptVersion: false
    },
    overrides: [
        {
            files: ['*.ts'],
            rules: {
                // override existing rules for playwright test package
                "no-null/no-null": "off",
                "no-undef": "off", // disabled due to 'browser', '$', '$$'
                "no-unused-expressions": "off"
            }
        }
    ]
};
