// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    formatMiniBrowserNavigateError,
    isMiniBrowserUriParseError,
    normalizeMiniBrowserOpenUrl,
} from './mini-browser-url-utils';

describe('normalizeMiniBrowserOpenUrl', () => {

    it('trims surrounding whitespace', () => {
        expect(normalizeMiniBrowserOpenUrl('  http://localhost:5173  ')).to.equal('http://localhost:5173');
    });

    it('replaces NBSP with spaces and trims', () => {
        expect(normalizeMiniBrowserOpenUrl('\u00a0http://localhost\u00a0')).to.equal('http://localhost');
    });

    it('fixes spaces around the scheme separator', () => {
        expect(normalizeMiniBrowserOpenUrl('http ://localhost:5173')).to.equal('http://localhost:5173');
    });

});

describe('isMiniBrowserUriParseError', () => {

    it('detects vscode-uri scheme errors', () => {
        expect(isMiniBrowserUriParseError(new Error('[UriError]: Scheme contains illegal characters.'))).to.equal(true);
        expect(isMiniBrowserUriParseError(new Error('network'))).to.equal(false);
    });

});

describe('formatMiniBrowserNavigateError', () => {

    it('returns a friendly message for URI parse failures', () => {
        const message = formatMiniBrowserNavigateError(new Error('[UriError]: Scheme contains illegal characters.'));
        expect(message).to.contain('Invalid URL');
    });

});
