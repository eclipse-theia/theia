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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import { ChatResponseContent } from '@theia/ai-chat/lib/common';
import { MermaidPartRenderer } from './mermaid-part-renderer';
disableJSDOM();

describe('MermaidPartRenderer', () => {

    const renderer = new MermaidPartRenderer();

    it('claims mermaid code blocks with a priority higher than the default code renderer (10)', () => {
        const content: ChatResponseContent = { kind: 'code', code: 'graph TD; A-->B;', language: 'mermaid' } as ChatResponseContent;
        expect(renderer.canHandle(content)).to.be.greaterThan(10);
    });

    it('is case-insensitive about the language', () => {
        const content: ChatResponseContent = { kind: 'code', code: 'graph TD; A-->B;', language: 'Mermaid' } as ChatResponseContent;
        expect(renderer.canHandle(content)).to.be.greaterThan(10);
    });

    it('does not claim code blocks of other languages', () => {
        const content: ChatResponseContent = { kind: 'code', code: 'const a = 1;', language: 'typescript' } as ChatResponseContent;
        expect(renderer.canHandle(content)).to.be.lessThan(0);
    });

    it('does not claim code blocks without a language', () => {
        const content: ChatResponseContent = { kind: 'code', code: 'plain' } as ChatResponseContent;
        expect(renderer.canHandle(content)).to.be.lessThan(0);
    });

    it('does not claim non-code content', () => {
        const content: ChatResponseContent = { kind: 'markdownContent' } as ChatResponseContent;
        expect(renderer.canHandle(content)).to.be.lessThan(0);
    });

});
