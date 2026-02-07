// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { expect } from 'chai';
import { MutableChatRequestModel, CodeChatResponseContentImpl, MarkdownChatResponseContentImpl } from './chat-model';
import { parseContents } from './parse-contents';
import { ResponseContentMatcher } from './response-content-matcher';

const fakeRequest = {} as MutableChatRequestModel;

// Custom matchers with incompleteContentFactory for testing
const TestCodeContentMatcher: ResponseContentMatcher = {
    start: /^```.*?$/m,
    end: /^```$/m,
    contentFactory: (content: string) => {
        const language = content.match(/^```(\w+)/)?.[1] || '';
        const code = content.replace(/^```(\w+)?\n|```$/g, '');
        return new CodeChatResponseContentImpl(code.trim(), language);
    },
    incompleteContentFactory: (content: string) => {
        const language = content.match(/^```(\w+)/)?.[1] || '';
        // Remove only the start delimiter, since we don't have an end delimiter yet
        const code = content.replace(/^```(\w+)?\n?/g, '');
        return new CodeChatResponseContentImpl(code.trim(), language);
    }
};

describe('parseContents with incomplete parts', () => {
    it('should handle incomplete code blocks with incompleteContentFactory', () => {
        // Only the start of a code block without an end
        const text = '```typescript\nconsole.log("Hello World");';
        const result = parseContents(text, fakeRequest, [TestCodeContentMatcher]);

        expect(result.length).to.equal(1);
        expect(result[0]).to.be.instanceOf(CodeChatResponseContentImpl);
        const codeContent = result[0] as CodeChatResponseContentImpl;
        expect(codeContent.code).to.equal('console.log("Hello World");');
        expect(codeContent.language).to.equal('typescript');
    });

    it('should handle complete code blocks with contentFactory', () => {
        const text = '```typescript\nconsole.log("Hello World");\n```';
        const result = parseContents(text, fakeRequest, [TestCodeContentMatcher]);

        expect(result.length).to.equal(1);
        expect(result[0]).to.be.instanceOf(CodeChatResponseContentImpl);
        const codeContent = result[0] as CodeChatResponseContentImpl;
        expect(codeContent.code).to.equal('console.log("Hello World");');
        expect(codeContent.language).to.equal('typescript');
    });

    it('should handle mixed content with incomplete and complete blocks', () => {
        const text = 'Some text\n```typescript\nconsole.log("Hello");\n```\nMore text\n```python\nprint("World")';
        const result = parseContents(text, fakeRequest, [TestCodeContentMatcher]);

        expect(result.length).to.equal(4);
        expect(result[0]).to.be.instanceOf(MarkdownChatResponseContentImpl);
        expect(result[1]).to.be.instanceOf(CodeChatResponseContentImpl);
        const completeContent = result[1] as CodeChatResponseContentImpl;
        expect(completeContent.language).to.equal('typescript');
        expect(result[2]).to.be.instanceOf(MarkdownChatResponseContentImpl);
        expect(result[3]).to.be.instanceOf(CodeChatResponseContentImpl);
        const incompleteContent = result[3] as CodeChatResponseContentImpl;
        expect(incompleteContent.language).to.equal('python');
    });

    it('should use default content factory if no incompleteContentFactory provided', () => {
        // Create a matcher without incompleteContentFactory
        const matcherWithoutIncomplete: ResponseContentMatcher = {
            start: /^<test>$/m,
            end: /^<\/test>$/m,
            contentFactory: (content: string) => new MarkdownChatResponseContentImpl('complete: ' + content)
        };

        // Text with only the start delimiter
        const text = '<test>\ntest content';
        const result = parseContents(text, fakeRequest, [matcherWithoutIncomplete]);

        expect(result.length).to.equal(1);
        expect(result[0]).to.be.instanceOf(MarkdownChatResponseContentImpl);
        expect((result[0] as MarkdownChatResponseContentImpl).content.value).to.equal('<test>\ntest content');
    });

    it('should handle incomplete code blocks without language identifier', () => {
        const text = '```\nsome code';
        const result = parseContents(text, fakeRequest, [TestCodeContentMatcher]);

        expect(result.length).to.equal(1);
        expect(result[0]).to.be.instanceOf(CodeChatResponseContentImpl);
        const codeContent = result[0] as CodeChatResponseContentImpl;
        expect(codeContent.code).to.equal('some code');
        expect(codeContent.language).to.equal('');
    });

    it('should prefer complete matches over incomplete ones', () => {
        // Text with both a complete and incomplete match at same position
        const text = '```typescript\nconsole.log();\n```\n<test>\ntest content';
        const matcherWithoutIncomplete: ResponseContentMatcher = {
            start: /^<test>$/m,
            end: /^<\/test>$/m,
            contentFactory: (content: string) => new MarkdownChatResponseContentImpl('complete: ' + content)
        };

        const result = parseContents(text, fakeRequest, [TestCodeContentMatcher, matcherWithoutIncomplete]);

        expect(result.length).to.equal(2);
        expect(result[0]).to.be.instanceOf(CodeChatResponseContentImpl);
        expect((result[0] as CodeChatResponseContentImpl).language).to.equal('typescript');
        expect(result[1]).to.be.instanceOf(MarkdownChatResponseContentImpl);
        expect((result[1] as MarkdownChatResponseContentImpl).content.value).to.contain('test content');
    });
});
