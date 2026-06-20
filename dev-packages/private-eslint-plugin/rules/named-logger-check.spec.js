const { RuleTester } = require('eslint');
const rule = require('./named-logger-check');

const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' }
});

ruleTester.run('named-logger-check', rule, {
    valid: [
        {
            code: `
                @injectable()
                class GoodClass {
                    constructor(@inject(ILogger) @named('[auth]my-package:GoodClass') logger) {}
                }
            `,
            filename: 'src/browser/good-class.ts'
        },
        {
            code: `
                class NormalClass {
                    doSomething() { console.log('This is fine'); }
                }
            `,
            filename: 'src/browser/normal-class.ts'
        },
        {
            code: `
                @injectable()
                class MainClass {
                    doSomething() { console.log('This is fine here'); }
                }
            `,
            filename: 'src/electron-main/main-app.ts'
        }
    ],
    invalid: [
        {
            code: `
                @injectable()
                class BadConsoleClass {
                    doSomething() { console.log('This should fail'); }
                }
            `,
            filename: 'src/browser/bad-console.ts',
            errors: [{ messageId: 'noConsole' }]
        },
        {
            code: `
                @injectable()
                class MissingNamedClass {
                    constructor(@inject(ILogger) logger) {}
                }
            `,
            filename: 'src/browser/missing-named.ts',
            errors: [{ messageId: 'missingNamed' }]
        },
        {
            code: `
                @injectable()
                class BadFormatClass {
                    constructor(@inject(ILogger) @named('just-a-random-name') logger) {}
                }
            `,
            filename: 'src/browser/bad-format.ts',
            errors: [{ messageId: 'invalidNameFormat' }]
        }
    ]
});
