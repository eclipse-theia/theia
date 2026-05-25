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

import { expect } from 'chai';
import { MutableChatRequestModel, ChatResponseContent, CodeChatResponseContentImpl, MarkdownChatResponseContentImpl } from './chat-model';
import { parseContents } from './parse-contents';
import { CodeContentMatcher, ResponseContentMatcher } from './response-content-matcher';

export class CommandChatResponseContentImpl implements ChatResponseContent {
    constructor(public readonly command: string) { }
    kind = 'command';
}

export const CommandContentMatcher: ResponseContentMatcher = {
    start: /^<command>$/m,
    end: /^<\/command>$/m,
    contentFactory: (content: string) => {
        const code = content.replace(/^<command>\n|<\/command>$/g, '');
        return new CommandChatResponseContentImpl(code.trim());
    }
};

const fakeRequest = {} as MutableChatRequestModel;

describe('parseContents', () => {
    it('should parse code content', () => {
        const text = '```typescript\nconsole.log("Hello World");\n```';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([new CodeChatResponseContentImpl('console.log("Hello World");', 'typescript')]);
    });

    it('should parse markdown content', () => {
        const text = 'Hello **World**';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([new MarkdownChatResponseContentImpl('Hello **World**')]);
    });

    it('should parse multiple content blocks', () => {
        const text = '```typescript\nconsole.log("Hello World");\n```\nHello **World**';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([
            new CodeChatResponseContentImpl('console.log("Hello World");', 'typescript'),
            new MarkdownChatResponseContentImpl('\nHello **World**')
        ]);
    });

    it('should parse multiple content blocks with different languages', () => {
        const text = '```typescript\nconsole.log("Hello World");\n```\n```python\nprint("Hello World")\n```';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([
            new CodeChatResponseContentImpl('console.log("Hello World");', 'typescript'),
            new CodeChatResponseContentImpl('print("Hello World")', 'python')
        ]);
    });

    it('should parse multiple content blocks with different languages and markdown', () => {
        const text = '```typescript\nconsole.log("Hello World");\n```\nHello **World**\n```python\nprint("Hello World")\n```';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([
            new CodeChatResponseContentImpl('console.log("Hello World");', 'typescript'),
            new MarkdownChatResponseContentImpl('\nHello **World**\n'),
            new CodeChatResponseContentImpl('print("Hello World")', 'python')
        ]);
    });

    it('should parse content blocks with empty content', () => {
        const text = '```typescript\n```\nHello **World**\n```python\nprint("Hello World")\n```';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([
            new CodeChatResponseContentImpl('', 'typescript'),
            new MarkdownChatResponseContentImpl('\nHello **World**\n'),
            new CodeChatResponseContentImpl('print("Hello World")', 'python')
        ]);
    });

    it('should parse content with markdown, code, and markdown', () => {
        const text = 'Hello **World**\n```typescript\nconsole.log("Hello World");\n```\nGoodbye **World**';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([
            new MarkdownChatResponseContentImpl('Hello **World**\n'),
            new CodeChatResponseContentImpl('console.log("Hello World");', 'typescript'),
            new MarkdownChatResponseContentImpl('\nGoodbye **World**')
        ]);
    });

    it('should handle text with no special content', () => {
        const text = 'Just some plain text.';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([new MarkdownChatResponseContentImpl('Just some plain text.')]);
    });

    it('should handle text with only start code block', () => {
        const text = '```typescript\nconsole.log("Hello World");';
        // We're using the standard CodeContentMatcher which has incompleteContentFactory
        const result = parseContents(text, fakeRequest);
        expect(result).to.deep.equal([new CodeChatResponseContentImpl('console.log("Hello World");', 'typescript')]);
    });

    it('should handle text with only end code block', () => {
        const text = 'console.log("Hello World");\n```';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([new MarkdownChatResponseContentImpl('console.log("Hello World");\n```')]);
    });

    it('should handle text with unmatched code block', () => {
        const text = '```typescript\nconsole.log("Hello World");\n```\n```python\nprint("Hello World")';
        // We're using the standard CodeContentMatcher which has incompleteContentFactory
        const result = parseContents(text, fakeRequest);
        expect(result).to.deep.equal([
            new CodeChatResponseContentImpl('console.log("Hello World");', 'typescript'),
            new CodeChatResponseContentImpl('print("Hello World")', 'python')
        ]);
    });

    it('should parse code block without newline after language', () => {
        const text = '```typescript console.log("Hello World");```';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([
            new MarkdownChatResponseContentImpl('```typescript console.log("Hello World");```')
        ]);
    });

    it('should parse code content without language identifier', () => {
        const text = '```\nsome code\n```';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher]);
        expect(result).to.deep.equal([new CodeChatResponseContentImpl('some code', '')]);
    });

    it('should parse with matches of multiple different matchers and default', () => {
        const text = '<command>\nMY_SPECIAL_COMMAND\n</command>\nHello **World**\n```python\nprint("Hello World")\n```\n<command>\nMY_SPECIAL_COMMAND2\n</command>';
        const result = parseContents(text, fakeRequest, [CodeContentMatcher, CommandContentMatcher]);
        expect(result).to.deep.equal([
            new CommandChatResponseContentImpl('MY_SPECIAL_COMMAND'),
            new MarkdownChatResponseContentImpl('\nHello **World**\n'),
            new CodeChatResponseContentImpl('print("Hello World")', 'python'),
            new CommandChatResponseContentImpl('MY_SPECIAL_COMMAND2'),
        ]);
    });
});
