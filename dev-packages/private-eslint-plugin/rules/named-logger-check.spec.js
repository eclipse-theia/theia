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
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Linter, RuleTester } = require('eslint');
const rule = require('./named-logger-check');
const { derivePackageName } = require('./named-logger-check');
const { MalformedPackageJsonError } = require('./find-package-json');

/**
 * Absolute path of a file within this repository. Absolute paths keep the tests independent of
 * the working directory, as the rule resolves the package.json relative to the linted file.
 * @param {...string} segments
 */
function repoFile(...segments) {
    return path.join(__dirname, '..', '..', '..', ...segments);
}

/**
 * @param {...string} segments
 */
function normalizedRepoFile(...segments) {
    return repoFile(...segments).replace(/\\/g, '/');
}

/**
 * Writes the given files into a fresh temporary directory, so that a test needing a specific
 * package layout neither depends on the real repository nor on the other tests. A fresh directory
 * per call also matters because a malformed package.json is only reported once per path.
 * @param {{[relativePath: string]: string}} files
 */
function tempFiles(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-named-logger-check-'));
    for (const [relativePath, content] of Object.entries(files)) {
        const file = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
    return {
        /** @param {string} relativePath */
        resolve: relativePath => path.join(root, relativePath),
        /** @param {string} relativePath */
        resolveNormalized: relativePath => path.join(root, relativePath).replace(/\\/g, '/'),
        dispose: () => fs.rmSync(root, { recursive: true, force: true })
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
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'good-class.ts')
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
            // The directory 'private-eslint-plugin' contains the package '@theia/eslint-plugin'.
            code: `
                @injectable()
                class GoodDevClass {
                    constructor(@inject(ILogger) @named('eslint-plugin:GoodDevClass') logger) {}
                }
            `,
            filename: repoFile('dev-packages', 'private-eslint-plugin', 'rules', 'good-dev-class.ts')
        },
        {
            // Relative on purpose: the rule must not resolve a package here, while an absolute path
            // would resolve one if the checkout itself sits below a directory named 'packages'.
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
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'anonymous-class.ts')
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
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'non-literal-class.ts')
        },
        {
            // The directory 'ai-hugging-face' contains the package '@theia/ai-huggingface'.
            code: `
                @injectable()
                class HuggingFaceLanguageModelsManagerImpl {
                    constructor(@inject(ILogger) @named('ai-huggingface:HuggingFaceLanguageModelsManagerImpl') logger) {}
                }
            `,
            filename: repoFile('packages', 'ai-hugging-face', 'src', 'node', 'huggingface-language-models-manager-impl.ts')
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
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'nested-classes.ts')
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
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'class-expression.ts')
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
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'real-class-name.ts'),
            errors: [{ messageId: 'classNameMismatch', data: { expected: 'RealClassName', actual: 'WrongClassName' } }]
        },
        {
            code: `
                @injectable()
                class CorrectClass {
                    constructor(@inject(ILogger) @named('wrong-package:CorrectClass') logger) {}
                }
            `,
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'correct-class.ts'),
            errors: [{ messageId: 'packageNameMismatch', data: { expected: 'my-package', actual: 'wrong-package' } }]
        },
        {
            code: `
                @injectable()
                class BothWrongClass {
                    constructor(@inject(ILogger) @named('wrong-package:WrongClass') logger) {}
                }
            `,
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'both-wrong-class.ts'),
            errors: [{ messageId: 'classNameMismatch' }, { messageId: 'packageNameMismatch' }]
        },
        {
            code: `
                @injectable()
                class HuggingFaceLanguageModelsManagerImpl {
                    constructor(@inject(ILogger) @named('ai-hugging-face:HuggingFaceLanguageModelsManagerImpl') logger) {}
                }
            `,
            filename: repoFile('packages', 'ai-hugging-face', 'src', 'node', 'huggingface-language-models-manager-impl.ts'),
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
            filename: repoFile('packages', 'my-package', 'src', 'browser', 'class-expression.ts'),
            errors: [{ messageId: 'classNameMismatch', data: { expected: 'InnerExpression', actual: 'OuterClass' } }]
        }
    ]
});

describe('derivePackageName', () => {
    it('prefers the package.json name over the directory name', () => {
        assert.strictEqual(derivePackageName(normalizedRepoFile('packages', 'ai-hugging-face', 'src', 'browser', 'foo.ts')), 'ai-huggingface');
        assert.strictEqual(derivePackageName(normalizedRepoFile('dev-packages', 'private-eslint-plugin', 'rules', 'foo.js')), 'eslint-plugin');
    });

    it('reads the innermost package.json when an outer directory is called "packages" too', () => {
        const nested = tempFiles({
            'packages/outer/package.json': '{ "name": "@theia/outer" }',
            'packages/outer/packages/inner/package.json': '{ "name": "@theia/inner" }'
        });
        try {
            assert.strictEqual(derivePackageName(nested.resolveNormalized('packages/outer/packages/inner/src/foo.ts')), 'inner');
        } finally {
            nested.dispose();
        }
    });

    it('falls back to the directory name if the package has no package.json', () => {
        assert.strictEqual(derivePackageName(normalizedRepoFile('packages', 'not-a-real-package', 'src', 'foo.ts')), 'not-a-real-package');
    });

    it('returns undefined outside of packages and dev-packages', () => {
        assert.strictEqual(derivePackageName('examples/browser/src/foo.ts'), undefined);
        assert.strictEqual(derivePackageName('mypackages/foo/bar.ts'), undefined);
    });

    it('throws if the package.json cannot be parsed', () => {
        const broken = tempFiles({ 'packages/broken/package.json': '{ "name": ' });
        try {
            assert.throws(() => derivePackageName(broken.resolveNormalized('packages/broken/src/broken-class.ts')), MalformedPackageJsonError);
        } finally {
            broken.dispose();
        }
    });
});

describe('malformed package.json', () => {
    it('is reported on the linted file instead of aborting the lint run', () => {
        const broken = tempFiles({ 'packages/broken/package.json': '{ "name": ' });
        try {
            const linter = new Linter();
            linter.defineRule('named-logger-check', rule);
            linter.defineParser('ts-parser', require('@typescript-eslint/parser'));
            const messages = linter.verify(
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
                broken.resolve('packages/broken/src/broken-class.ts')
            );
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].ruleId, 'named-logger-check');
            assert.ok(messages[0].message.startsWith(`Cannot read "${broken.resolve('packages/broken/package.json')}"`), messages[0].message);
        } finally {
            broken.dispose();
        }
    });
});
