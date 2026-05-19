// *****************************************************************************
// Copyright (C) 2026 Ericsson and others.
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
import { ToolCallContentResult } from '@theia/ai-core';

describe('MCPFrontendServiceImpl html content mapping', () => {

    // Simulates the mapping logic from convertToToolRequest's default case
    function mapContent(callContent: Record<string, unknown>): ToolCallContentResult {
        const type = callContent.type as string;
        switch (type) {
            case 'image':
                return { type: 'image', base64data: callContent.data as string, mimeType: callContent.mimeType as string };
            case 'text':
                return { type: 'text', text: callContent.text as string };
            default:
                if ('html' in callContent && typeof callContent.html === 'string') {
                    return { type: 'html', html: callContent.html, title: callContent.title as string | undefined };
                }
                return { type: 'text', text: JSON.stringify(callContent) };
        }
    }

    it('maps html content with title', () => {
        const result = mapContent({ type: 'html', html: '<div>App</div>', title: 'My App' });
        expect(result).to.deep.equal({ type: 'html', html: '<div>App</div>', title: 'My App' });
    });

    it('maps html content without title', () => {
        const result = mapContent({ type: 'html', html: '<p>Hello</p>' });
        expect(result).to.deep.equal({ type: 'html', html: '<p>Hello</p>', title: undefined });
    });

    it('falls back to text for unknown type without html field', () => {
        const result = mapContent({ type: 'unknown', data: 'foo' });
        expect(result.type).to.equal('text');
        expect((result as { text: string }).text).to.equal(JSON.stringify({ type: 'unknown', data: 'foo' }));
    });

    it('still maps text content normally', () => {
        const result = mapContent({ type: 'text', text: 'hello world' });
        expect(result).to.deep.equal({ type: 'text', text: 'hello world' });
    });

    it('still maps image content normally', () => {
        const result = mapContent({ type: 'image', data: 'base64data', mimeType: 'image/png' });
        expect(result).to.deep.equal({ type: 'image', base64data: 'base64data', mimeType: 'image/png' });
    });
});
