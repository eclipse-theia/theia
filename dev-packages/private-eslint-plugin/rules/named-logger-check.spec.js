// *****************************************************************************
// Copyright (C) 2026 Eclipse Foundation and others.
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
const path = require('path');
const { RuleTester } = require('eslint');
const rule = require('./named-logger-check');
const { derivePackageName } = require('./named-logger-check');

function fakePackageJsonFs(byPath) {
    return {
        existsSync: p => Object.prototype.hasOwnProperty.call(byPath, p),
        readFileSync: p => JSON.stringify(byPath[p])
    };
}

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
        },
        {
            code: `
                @injectable()
                class ShadowedConsoleClass {
                    doSomething() {
                        this.newCommandHandler(console => console.selectAll());
                    }
                }
            `
        },
        {
            code: `
                @injectable()
                class GoodClass {
                    constructor(@inject(ILogger) @named('[auth]my-package:GoodClass') logger) {}
                }
            `,
            filename: 'packages/my-package/src/browser/good-class.ts',
            options: [{
                __testFsImpl: fakePackageJsonFs({
                    [path.join('packages', 'my-package', 'package.json')]: { name: '@theia/my-package' }
                })
            }]
        },
        {
            code: `
                @injectable()
                class GoodDevClass {
                    constructor(@inject(ILogger) @named('private-eslint-plugin:GoodDevClass') logger) {}
                }
            `,
            filename: 'dev-packages/private-eslint-plugin/src/rules/good-dev-class.ts',
            options: [{
                __testFsImpl: fakePackageJsonFs({
                    [path.join('dev-packages', 'private-eslint-plugin', 'package.json')]: { name: '@theia/private-eslint-plugin' }
                })
            }]
        },
        {
            code: `
                @injectable()
                class OutsidePackagesClass {
                    constructor(@inject(ILogger) @named('anything-goes-here:OutsidePackagesClass') logger) {}
                }
            `,
            filename: 'examples/browser-only/src/browser/outside-packages-class.ts'
        },
        {
            code: `
                @injectable()
                export default class {
                    constructor(@inject(ILogger) @named('my-package:AnyNameWorks') logger) {}
                }
            `,
            filename: 'packages/my-package/src/browser/anonymous-class.ts'
        },
        {
            code: `
                @injectable()
                class AmbiguousPathClass {
                    constructor(@inject(ILogger) @named('mypackages:AmbiguousPathClass') logger) {}
                }
            `,
            filename: 'mypackages/foo/ambiguous-path-class.ts'
        },
        {
            code: `
                const SOME_CONSTANT = 'my-package:NonLiteralClass';
                @injectable()
                class NonLiteralClass {
                    constructor(@inject(ILogger) @named(SOME_CONSTANT) logger) {}
                }
            `,
            filename: 'packages/my-package/src/browser/non-literal-class.ts'
        },
        {
            code: `
                @injectable()
                class HuggingFaceLanguageModelsManagerImpl {
                    constructor(@inject(ILogger) @named('ai-huggingface:HuggingFaceLanguageModelsManagerImpl') logger) {}
                }
            `,
            filename: 'packages/ai-hugging-face/src/node/hugging-face-language-models-manager-impl.ts',
            options: [{
                __testFsImpl: fakePackageJsonFs({
                    [path.join('packages', 'ai-hugging-face', 'package.json')]: { name: '@theia/ai-huggingface' }
                })
            }]
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
            filename: 'packages/my-package/src/browser/nested-classes.ts'
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
        },
        {
            code: `
                @injectable()
                class RealClassName {
                    constructor(@inject(ILogger) @named('my-package:WrongClassName') logger) {}
                }
            `,
            filename: 'packages/my-package/src/browser/real-class-name.ts',
            options: [{
                __testFsImpl: fakePackageJsonFs({
                    [path.join('packages', 'my-package', 'package.json')]: { name: '@theia/my-package' }
                })
            }],
            errors: [{ messageId: 'classNameMismatch', data: { expected: 'RealClassName', actual: 'WrongClassName' } }]
        },
        {
            code: `
                @injectable()
                class CorrectClass {
                    constructor(@inject(ILogger) @named('wrong-package:CorrectClass') logger) {}
                }
            `,
            filename: 'packages/my-package/src/browser/correct-class.ts',
            options: [{
                __testFsImpl: fakePackageJsonFs({
                    [path.join('packages', 'my-package', 'package.json')]: { name: '@theia/my-package' }
                })
            }],
            errors: [{ messageId: 'packageNameMismatch', data: { expected: 'my-package', actual: 'wrong-package' } }]
        },
        {
            code: `
                @injectable()
                class BothWrongClass {
                    constructor(@inject(ILogger) @named('wrong-package:WrongClass') logger) {}
                }
            `,
            filename: 'packages/my-package/src/browser/both-wrong-class.ts',
            options: [{
                __testFsImpl: fakePackageJsonFs({
                    [path.join('packages', 'my-package', 'package.json')]: { name: '@theia/my-package' }
                })
            }],
            errors: [{ messageId: 'classNameMismatch' }, { messageId: 'packageNameMismatch' }]
        },
        {
            code: `
                @injectable()
                class HuggingFaceLanguageModelsManagerImpl {
                    constructor(@inject(ILogger) @named('ai-hugging-face:HuggingFaceLanguageModelsManagerImpl') logger) {}
                }
            `,
            filename: 'packages/ai-hugging-face/src/node/hugging-face-language-models-manager-impl.ts',
            options: [{
                __testFsImpl: fakePackageJsonFs({
                    [path.join('packages', 'ai-hugging-face', 'package.json')]: { name: '@theia/ai-huggingface' }
                })
            }],
            errors: [{ messageId: 'packageNameMismatch', data: { expected: 'ai-huggingface', actual: 'ai-hugging-face' } }]
        }
    ]
});

describe('derivePackageName', () => {
    it('reads the scoped package name from the nearest package.json', () => {
        const fsImpl = fakePackageJsonFs({
            [path.join('packages', 'ai-hugging-face', 'package.json')]: { name: '@theia/ai-huggingface' }
        });
        assert.strictEqual(
            derivePackageName(path.join('packages', 'ai-hugging-face', 'src', 'browser', 'foo.ts'), fsImpl),
            'ai-huggingface'
        );
    });

    it('is not fooled by an earlier "packages" segment in the path', () => {
        const fsImpl = fakePackageJsonFs({
            [path.join('~', 'packages', 'theia', 'packages', 'core', 'package.json')]: { name: '@theia/core' }
        });
        assert.strictEqual(
            derivePackageName(path.join('~', 'packages', 'theia', 'packages', 'core', 'src', 'foo.ts'), fsImpl),
            'core'
        );
    });

    it('returns undefined when no package.json is found', () => {
        assert.strictEqual(
            derivePackageName(path.join('some', 'random', 'path', 'foo.ts'), fakePackageJsonFs({})),
            undefined
        );
    });
});
