// *****************************************************************************
// Copyright (C) 2026 ankitsharma101 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const assert = require('assert');
const fs = require('fs');
const { Linter, RuleTester } = require('eslint');
const rule = require('./named-logger-check');
const { tempFiles } = require('../util/test/temp-files');

/**
 * Stand-in for the Theia monorepo, covering the package layouts the rule has to tell apart.
 */
const repo = tempFiles({
    'package.json': '{ "name": "@theia/monorepo" }',
    'packages/my-package/package.json': '{ "name": "@theia/my-package" }',
    // The directory 'ai-hugging-face' contains the package '@theia/ai-huggingface'.
    'packages/ai-hugging-face/package.json': '{ "name": "@theia/ai-huggingface" }',
    // The directory 'private-eslint-plugin' contains the package '@theia/eslint-plugin'.
    'dev-packages/private-eslint-plugin/package.json': '{ "name": "@theia/eslint-plugin" }',
    'examples/browser-only/package.json': '{ "name": "@theia/example-browser-only" }',
    'mypackages/foo/package.json': '{ "name": "@theia/foo" }'
});
after(() => repo.dispose());

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
            filename: repo.resolve('packages/my-package/src/browser/good-class.ts')
        },
        {
            code: `
                class NormalClass {
                    doSomething() { console.log('This is fine'); }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/normal-class.ts')
        },
        {
            code: `
                @injectable()
                class ShadowedConsoleClass {
                    doSomething() {
                        this.newCommandHandler(console => console.selectAll());
                    }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/shadowed-console-class.ts')
        },
        {
            // Only the console methods ILogger can replace are reported.
            code: `
                @injectable()
                class ProfilingClass {
                    doSomething() {
                        console.time('work');
                        console.group('details');
                        console.table([]);
                        console.timeEnd('work');
                    }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/profiling-class.ts')
        },
        {
            // A nested class is not covered by the @injectable() decorator of its enclosing class.
            code: `
                @injectable()
                class InjectableOuterClass {
                    createHelper() {
                        return class PlainHelper {
                            doSomething() { console.log('This is fine'); }
                        };
                    }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/plain-nested-class.ts')
        },
        {
            code: `
                @injectable()
                class GoodDevClass {
                    constructor(@inject(ILogger) @named('eslint-plugin:GoodDevClass') logger) {}
                }
            `,
            filename: repo.resolve('dev-packages/private-eslint-plugin/rules/good-dev-class.ts')
        },
        {
            // Not below packages/dev-packages, so the convention does not apply and any name passes.
            code: `
                @injectable()
                class OutsidePackagesClass {
                    constructor(@inject(ILogger) @named('anything-goes-here:OutsidePackagesClass') logger) {}
                }
            `,
            filename: repo.resolve('examples/browser-only/src/browser/outside-packages-class.ts')
        },
        {
            code: `
                @injectable()
                export default class {
                    constructor(@inject(ILogger) @named('my-package:AnyNameWorks') logger) {}
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/anonymous-class.ts')
        },
        {
            // 'mypackages' is not 'packages', so this is outside of the convention as well.
            code: `
                @injectable()
                class AmbiguousPathClass {
                    constructor(@inject(ILogger) @named('anything-goes-here:AmbiguousPathClass') logger) {}
                }
            `,
            filename: repo.resolve('mypackages/foo/src/ambiguous-path-class.ts')
        },
        {
            code: `
                const SOME_CONSTANT = 'my-package:NonLiteralClass';
                @injectable()
                class NonLiteralClass {
                    constructor(@inject(ILogger) @named(SOME_CONSTANT) logger) {}
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/non-literal-class.ts')
        },
        {
            code: `
                @injectable()
                class HuggingFaceLanguageModelsManagerImpl {
                    constructor(@inject(ILogger) @named('ai-huggingface:HuggingFaceLanguageModelsManagerImpl') logger) {}
                }
            `,
            filename: repo.resolve('packages/ai-hugging-face/src/node/huggingface-language-models-manager-impl.ts')
        },
        {
            code: `
                @injectable()
                class OuterClass {
                    doSomething() {
                        @injectable()
                        class InnerClass {
                            constructor(@inject(ILogger) @named('my-package:InnerClass') logger) {}
                        }
                        return InnerClass;
                    }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/nested-classes.ts')
        },
        {
            code: `
                @injectable()
                class OuterClass {
                    createHandler() {
                        return class InnerExpression {
                            @inject(ILogger) @named('my-package:InnerExpression')
                            protected readonly logger: ILogger;
                        };
                    }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/class-expression.ts')
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
            filename: repo.resolve('packages/my-package/src/browser/bad-console.ts'),
            errors: [{ messageId: 'noConsole' }]
        },
        {
            // A nested @injectable() class is covered even if its enclosing class is not.
            code: `
                class PlainOuterClass {
                    createService() {
                        @injectable()
                        class InjectableInnerClass {
                            doSomething() { console.log('This should fail'); }
                        }
                        return InjectableInnerClass;
                    }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/injectable-nested-class.ts'),
            errors: [{ messageId: 'noConsole' }]
        },
        {
            code: `
                @injectable()
                class MissingNamedClass {
                    constructor(@inject(ILogger) logger) {}
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/missing-named.ts'),
            errors: [{ messageId: 'missingNamed' }]
        },
        {
            code: `
                @injectable()
                class BadFormatClass {
                    constructor(@inject(ILogger) @named('just-a-random-name') logger) {}
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/bad-format.ts'),
            errors: [{ messageId: 'invalidNameFormat' }]
        },
        {
            code: `
                @injectable()
                class RealClassName {
                    constructor(@inject(ILogger) @named('my-package:WrongClassName') logger) {}
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/real-class-name.ts'),
            errors: [{ messageId: 'classNameMismatch', data: { expected: 'RealClassName', actual: 'WrongClassName' } }]
        },
        {
            code: `
                @injectable()
                class CorrectClass {
                    constructor(@inject(ILogger) @named('wrong-package:CorrectClass') logger) {}
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/correct-class.ts'),
            errors: [{ messageId: 'packageNameMismatch', data: { expected: 'my-package', actual: 'wrong-package' } }]
        },
        {
            code: `
                @injectable()
                class BothWrongClass {
                    constructor(@inject(ILogger) @named('wrong-package:WrongClass') logger) {}
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/both-wrong-class.ts'),
            errors: [{ messageId: 'classNameMismatch' }, { messageId: 'packageNameMismatch' }]
        },
        {
            code: `
                @injectable()
                class HuggingFaceLanguageModelsManagerImpl {
                    constructor(@inject(ILogger) @named('ai-hugging-face:HuggingFaceLanguageModelsManagerImpl') logger) {}
                }
            `,
            filename: repo.resolve('packages/ai-hugging-face/src/node/huggingface-language-models-manager-impl.ts'),
            errors: [{ messageId: 'packageNameMismatch', data: { expected: 'ai-huggingface', actual: 'ai-hugging-face' } }]
        },
        {
            code: `
                @injectable()
                class OuterClass {
                    createHandler() {
                        return class InnerExpression {
                            @inject(ILogger) @named('my-package:OuterClass')
                            protected readonly logger: ILogger;
                        };
                    }
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/class-expression.ts'),
            errors: [{ messageId: 'classNameMismatch', data: { expected: 'InnerExpression', actual: 'OuterClass' } }]
        }
    ]
});

describe('malformed package.json', () => {

    /**
     * Lints a class whose logger name matches the 'broken' package, and returns the problems.
     * @param {string} filename
     */
    function lintBrokenClass(filename) {
        const linter = new Linter();
        linter.defineRule('named-logger-check', rule);
        linter.defineParser('ts-parser', require('@typescript-eslint/parser'));
        return linter.verify(
            `
            @injectable()
            class BrokenClass {
                constructor(@inject(ILogger) @named('broken:BrokenClass') logger) {}
            }
            `,
            {
                parser: 'ts-parser',
                parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
                rules: { 'named-logger-check': 'error' }
            },
            filename
        );
    }

    it('is reported on the linted file instead of aborting the lint run', () => {
        const broken = tempFiles({ 'packages/broken/package.json': '{ "name": ' });
        try {
            const messages = lintBrokenClass(broken.resolve('packages/broken/src/broken-class.ts'));
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].ruleId, 'named-logger-check');
            assert.ok(messages[0].message.startsWith(`Cannot read "${broken.resolve('packages/broken/package.json')}"`), messages[0].message);
        } finally {
            broken.dispose();
        }
    });

    it('is reported once per breakage rather than once per process', () => {
        const broken = tempFiles({ 'packages/broken/package.json': '{ "name": ' });
        const packageJson = broken.resolve('packages/broken/package.json');
        const linted = broken.resolve('packages/broken/src/broken-class.ts');
        try {
            assert.strictEqual(lintBrokenClass(linted).length, 1, 'the first breakage is reported');
            assert.strictEqual(lintBrokenClass(linted).length, 0, 'the same breakage is not reported again');

            // The contents below differ in length from the ones they replace, so that the cache is
            // invalidated regardless of the modification time resolution.
            fs.writeFileSync(packageJson, '{ "name": "@theia/broken" }');
            assert.strictEqual(lintBrokenClass(linted).length, 0, 'a repaired package.json reports nothing');

            fs.writeFileSync(packageJson, '{ "name":');
            assert.strictEqual(lintBrokenClass(linted).length, 1, 'a new breakage is reported again');
        } finally {
            broken.dispose();
        }
    });
});
