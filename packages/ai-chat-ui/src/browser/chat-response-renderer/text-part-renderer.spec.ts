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

import { TextPartRenderer } from './text-part-renderer';
import { expect } from 'chai';
import { ChatResponseContent } from '@theia/ai-chat';

describe('TextPartRenderer', () => {

    it('accepts all parts', () => {
        const renderer = new TextPartRenderer();
        expect(renderer.canHandle({ kind: 'text' })).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'code' })).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'command' })).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'error' })).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'horizontal' })).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'informational' })).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'markdownContent' })).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'toolCall' })).to.be.greaterThan(0);
        expect(renderer.canHandle(undefined as unknown as ChatResponseContent)).to.be.greaterThan(0);
    });

    it('renders text correctly', () => {
        const renderer = new TextPartRenderer();
        const part = { kind: 'text', asString: () => 'Hello, World!' };
        const node = renderer.render(part);
        expect(JSON.stringify(node)).to.contain('Hello, World!');
    });

    it('handles undefined content gracefully', () => {
        const renderer = new TextPartRenderer();
        const part = undefined as unknown as ChatResponseContent;
        const node = renderer.render(part);
        expect(node).to.exist;
    });

});
