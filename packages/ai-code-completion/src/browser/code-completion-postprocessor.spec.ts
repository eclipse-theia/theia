// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { DefaultCodeCompletionPostProcessor } from './code-completion-postprocessor';

disableJSDOM();

describe('CodeCompletionAgentImpl', () => {
    let codeCompletionProcessor: DefaultCodeCompletionPostProcessor;
    before(() => {
        disableJSDOM = enableJSDOM();
        codeCompletionProcessor = new DefaultCodeCompletionPostProcessor();
    });

    after(() => {
        // Disable JSDOM after all tests
        disableJSDOM();
    });

    describe('stripBackticks', () => {

        it('should remove surrounding backticks and language (TypeScript)', () => {
            const input = '```TypeScript\nconsole.log(\"Hello, World!\");```';
            const output = codeCompletionProcessor.stripBackticks(input);
            expect(output).to.equal('console.log("Hello, World!");');
        });

        it('should remove surrounding backticks and language (md)', () => {
            const input = '```md\nconsole.log(\"Hello, World!\");```';
            const output = codeCompletionProcessor.stripBackticks(input);
            expect(output).to.equal('console.log("Hello, World!");');
        });

        it('should remove all text after second occurrence of backticks', () => {
            const input = '```js\nlet x = 10;\n```\nTrailing text should be removed';
            const output = codeCompletionProcessor.stripBackticks(input);
            expect(output).to.equal('let x = 10;');
        });

        it('should return the text unchanged if no surrounding backticks', () => {
            const input = 'console.log(\"Hello, World!\");';
            const output = codeCompletionProcessor.stripBackticks(input);
            expect(output).to.equal('console.log("Hello, World!");');
        });

        it('should remove surrounding backticks without language', () => {
            const input = '```\nconsole.log(\"Hello, World!\");```';
            const output = codeCompletionProcessor.stripBackticks(input);
            expect(output).to.equal('console.log("Hello, World!");');
        });

        it('should handle text starting with backticks but no second delimiter', () => {
            const input = '```python\nprint(\"Hello, World!\")';
            const output = codeCompletionProcessor.stripBackticks(input);
            expect(output).to.equal('print("Hello, World!")');
        });

        it('should handle multiple internal backticks correctly', () => {
            const input = '```\nFoo```Bar```FooBar```';
            const output = codeCompletionProcessor.stripBackticks(input);
            expect(output).to.equal('Foo```Bar```FooBar');
        });

    });
});
