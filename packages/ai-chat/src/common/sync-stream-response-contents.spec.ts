// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import {
    ChatResponseContent,
    MarkdownChatResponseContentImpl,
    ToolCallChatResponseContentImpl,
} from './chat-model';
import { MutableStreamChatResponse, syncStreamResponseContents } from './sync-stream-response-contents';

class TestMutableStreamChatResponse implements MutableStreamChatResponse {
    content: ChatResponseContent[] = [];
    changed = 0;
    cleared = 0;

    clearContent(): void {
        this.content = [];
        this.cleared += 1;
    }

    addContent(content: ChatResponseContent): void {
        this.content.push(content);
    }

    addContents(contents: ChatResponseContent[]): void {
        contents.forEach(content => this.addContent(content));
    }

    responseContentChanged(): void {
        this.changed += 1;
    }
}

describe('syncStreamResponseContents', () => {

    it('merges growing markdown in place without clearing', () => {
        const response = new TestMutableStreamChatResponse();
        const first = new MarkdownChatResponseContentImpl('Hello');
        response.addContents([first]);

        const changed = syncStreamResponseContents(response, 0, [
            new MarkdownChatResponseContentImpl('Hello world'),
        ]);

        expect(changed).to.be.true;
        expect(response.cleared).to.equal(0);
        expect(response.content).to.have.lengthOf(1);
        expect(response.content[0]).to.equal(first);
        expect((response.content[0] as MarkdownChatResponseContentImpl).content.value).to.equal('Hello world');
    });

    it('preserves content before startIndex while streaming after a tool call', () => {
        const response = new TestMutableStreamChatResponse();
        const tool = new ToolCallChatResponseContentImpl('tool-1', 'Read', '{}', false);
        const markdown = new MarkdownChatResponseContentImpl('Hi');
        response.addContents([tool, markdown]);

        syncStreamResponseContents(response, 1, [
            new MarkdownChatResponseContentImpl('Hi there'),
        ]);

        expect(response.cleared).to.equal(0);
        expect(response.content).to.have.lengthOf(2);
        expect(response.content[0]).to.equal(tool);
        expect(response.content[1]).to.equal(markdown);
        expect((markdown as MarkdownChatResponseContentImpl).content.value).to.equal('Hi there');
    });

    it('replaces the stream segment when structure changes', () => {
        const response = new TestMutableStreamChatResponse();
        response.addContents([new MarkdownChatResponseContentImpl('Before')]);

        syncStreamResponseContents(response, 0, [
            new ToolCallChatResponseContentImpl('tool-2', 'Bash', '{}', false),
        ]);

        expect(response.cleared).to.equal(1);
        expect(response.content).to.have.lengthOf(1);
        expect(response.content[0].kind).to.equal('toolCall');
    });
});
