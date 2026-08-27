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

describe('McpAppFrame buildSrcDoc', () => {

    it('injects CSP into <head> and resize script before </body>', () => {
        const html = '<html><head><title>App</title></head><body><p>Hello</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('Content-Security-Policy');
        expect(result).to.contain('mcp-app-resize');
        expect(result.indexOf('Content-Security-Policy')).to.be.lessThan(result.indexOf('</head>'));
        expect(result.indexOf('ResizeObserver')).to.be.lessThan(result.indexOf('</body>'));
    });

    it('handles <head> with attributes (e.g. <head lang="en">)', () => {
        const html = '<html><head lang="en"><title>App</title></head><body><p>Hi</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('Content-Security-Policy');
        // Should not inject a second <head>
        const headCount = (result.match(/<head/gi) || []).length;
        expect(headCount).to.equal(1);
    });

    it('handles uppercase <HEAD>', () => {
        const html = '<html><HEAD><title>App</title></HEAD><body><p>Hi</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('Content-Security-Policy');
        const headCount = (result.match(/<head/gi) || []).length;
        expect(headCount).to.equal(1);
    });

    it('wraps CSP in a new <head> when only <html> is present', () => {
        const html = '<html><body><p>No head</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('<head>');
        expect(result).to.contain('Content-Security-Policy');
    });

    it('prepends CSP when no <html> or <head> present', () => {
        const html = '<div>Simple content</div>';
        const result = buildSrcDoc(html);
        expect(result).to.match(/^<meta/);
        expect(result).to.contain('Content-Security-Policy');
        expect(result).to.contain('<div>Simple content</div>');
    });

    it('appends resize script when no </body> tag', () => {
        const html = '<div>Simple content</div>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('mcp-app-resize');
        expect(result.endsWith('</script>')).to.be.true;
    });

    it('handles empty html', () => {
        const result = buildSrcDoc('');
        expect(result).to.contain('Content-Security-Policy');
        expect(result).to.contain('mcp-app-resize');
    });

    it('preserves original html content', () => {
        const html = '<html><head></head><body><h1>Title</h1><p>Content</p></body></html>';
        const result = buildSrcDoc(html);
        expect(result).to.contain('<h1>Title</h1>');
        expect(result).to.contain('<p>Content</p>');
    });

    it('CSP blocks connect-src', () => {
        const result = buildSrcDoc('<html><head></head><body></body></html>');
        expect(result).to.contain("connect-src 'none'");
    });
});
