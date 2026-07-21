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
import { buildSrcDoc } from './mcp-app-frame';

/**
 * Tests for the buildSrcDoc logic used by McpAppFrame.
 * Exercises the real exported function rather than a hand-copied reimplementation.
 */
describe('McpAppFrame buildSrcDoc', () => {

    it('injects CSP and resize script into a full HTML document', () => {
        const html = '<html><head></head><body><p>Hello</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('Content-Security-Policy');
        expect(result).to.contain('mcp-app-resize');
        expect(result).to.contain('<p>Hello</p>');
        expect(result.indexOf('Content-Security-Policy')).to.be.lessThan(result.indexOf('</head>'));
        expect(result.indexOf('ResizeObserver')).to.be.lessThan(result.indexOf('</body>'));
    });

    it('injects CSP into <head> when present', () => {
        const html = '<html><head><title>App</title></head><body></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('<head><meta http-equiv="Content-Security-Policy"');
    });

    it('wraps CSP in a <head> when html tag exists but no <head>', () => {
        const html = '<html><body><div>content</div></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('<head><meta http-equiv="Content-Security-Policy"');
        expect(result).to.contain('</head>');
    });

    it('prepends CSP when no <html> or <head> tags', () => {
        const html = '<div>Simple content</div>';
        const result = buildSrcDoc(html);
        expect(result).to.match(/^<meta http-equiv="Content-Security-Policy"/);
        expect(result).to.contain('<div>Simple content</div>');
    });

    it('appends resize script when no </body> tag', () => {
        const html = '<div>Simple content</div>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('mcp-app-resize');
        expect(result).to.match(/ResizeObserver[\s\S]*<\/script>$/);
    });

    it('preserves original html content', () => {
        const html = '<html><head></head><body><h1>Title</h1><p>Content</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('<h1>Title</h1>');
        expect(result).to.contain('<p>Content</p>');
    });

    it('handles empty html', () => {
        const result = buildSrcDoc('');
        expect(result).to.contain('Content-Security-Policy');
        expect(result).to.contain('mcp-app-resize');
    });

    it('CSP blocks connect-src', () => {
        const result = buildSrcDoc('<html><head></head><body></body></html>');
        expect(result).to.contain("connect-src 'none'");
    });
});
