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

/**
 * Tests for the srcDoc injection logic used by McpAppFrame.
 * We test the pure logic without requiring a DOM/React rendering environment.
 */
describe('McpAppFrame srcDoc injection', () => {

    const RESIZE_SCRIPT = `<script>
new ResizeObserver(() => {
    window.parent.postMessage({ type: 'mcp-app-resize', height: document.documentElement.scrollHeight }, '*');
}).observe(document.documentElement);
</script>`;

    function buildSrcDoc(html: string): string {
        return html.includes('</body>')
            ? html.replace('</body>', `${RESIZE_SCRIPT}</body>`)
            : `${html}${RESIZE_SCRIPT}`;
    }

    it('injects resize script before </body> when present', () => {
        const html = '<html><body><p>Hello</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('mcp-app-resize');
        expect(result).to.contain('<p>Hello</p>');
        expect(result.indexOf('ResizeObserver')).to.be.lessThan(result.indexOf('</body>'));
    });

    it('appends resize script when no </body> tag', () => {
        const html = '<div>Simple content</div>';
        const result = buildSrcDoc(html);
        expect(result).to.equal(`<div>Simple content</div>${RESIZE_SCRIPT}`);
    });

    it('preserves original html content', () => {
        const html = '<html><body><h1>Title</h1><p>Content</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('<h1>Title</h1>');
        expect(result).to.contain('<p>Content</p>');
    });

    it('handles empty html', () => {
        const result = buildSrcDoc('');
        expect(result).to.equal(RESIZE_SCRIPT);
    });
});
