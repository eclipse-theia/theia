// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { formatProviderError, formattedProviderErrorToShortString } from './provider-error-formatter';

describe('formatProviderError', () => {

    it('should handle undefined input', () => {
        const result = formatProviderError(undefined);
        expect(result.message).to.equal('');
        expect(result.status).to.be.undefined;
        expect(result.details).to.be.undefined;
        expect(result.raw).to.equal('');
    });

    it('should handle empty string input', () => {
        const result = formatProviderError('');
        expect(result.message).to.equal('');
        expect(result.status).to.be.undefined;
        expect(result.details).to.be.undefined;
        expect(result.raw).to.equal('');
    });

    it('should handle plain text error without JSON', () => {
        const result = formatProviderError('Something went wrong');
        expect(result.message).to.equal('Something went wrong');
        expect(result.status).to.be.undefined;
        expect(result.details).to.be.undefined;
        expect(result.raw).to.equal('Something went wrong');
    });

    it('should extract HTTP status from leading prefix', () => {
        const raw = '401 {"error":{"message":"Invalid API key","type":"auth_error"}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('401');
        expect(result.message).to.equal('Invalid API key');
        expect(result.details).to.be.a('string');
        expect(result.raw).to.equal(raw);
    });

    it('should extract status from JSON code field when no leading prefix', () => {
        const raw = '{"error":{"message":"Permission denied","code":403}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('403');
        expect(result.message).to.equal('Permission denied');
    });

    it('should extract status from JSON status field', () => {
        const raw = '{"error":{"message":"Not found","status":404}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('404');
        expect(result.message).to.equal('Not found');
    });

    it('should prefer leading HTTP status over JSON code field', () => {
        const raw = '500 {"error":{"message":"Server error","code":503}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('500');
        expect(result.message).to.equal('Server error');
    });

    it('should extract the deepest message from nested JSON', () => {
        const raw = '400 {"error":{"message":"Top level","details":{"message":"Deeper reason"}}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('400');
        expect(result.message).to.equal('Deeper reason');
    });

    it('should handle Gemini-style errors with JSON-encoded inner body', () => {
        const inner = JSON.stringify({ error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } });
        const raw = `{"error":{"message":${JSON.stringify(inner)},"code":400}}`;
        const result = formatProviderError(raw);
        expect(result.status).to.equal('400');
        expect(result.message).to.equal('API key not valid');
    });

    it('should fall back to remainder when JSON has no message field', () => {
        const raw = '429 {"error":{"type":"rate_limit"}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('429');
        expect(result.message).to.equal('{"error":{"type":"rate_limit"}}');
    });

    it('should not treat a leading 3-digit prefix as a status when no JSON body follows', () => {
        // Avoid misreading arbitrary text that happens to start with 3 digits.
        const raw = '404 routes were processed';
        const result = formatProviderError(raw);
        expect(result.status).to.be.undefined;
        expect(result.message).to.equal('404 routes were processed');
        expect(result.details).to.be.undefined;
    });

    it('should produce unwrapped details for nested JSON strings', () => {
        const inner = JSON.stringify({ reason: 'quota exceeded' });
        const raw = `{"error":{"message":"Rate limited","body":${JSON.stringify(inner)}}}`;
        const result = formatProviderError(raw);
        expect(result.details).to.be.a('string');
        // The details should contain the unwrapped inner object, not the escaped JSON string
        const parsed = JSON.parse(result.details!);
        expect(parsed.error.body).to.deep.equal({ reason: 'quota exceeded' });
    });

    it('should not treat a message that looks like JSON as the headline', () => {
        const raw = '{"error":{"message":"{\\"key\\":\\"value\\"}","code":400}}';
        const result = formatProviderError(raw);
        // The JSON-like message should be skipped; headline falls back to remainder
        expect(result.message).to.equal('{"error":{"message":"{\\"key\\":\\"value\\"}","code":400}}');
    });

    it('should handle leading status with colon separator', () => {
        const raw = '401: {"error":{"message":"Unauthorized"}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('401');
        expect(result.message).to.equal('Unauthorized');
    });

    it('should extract message from an array of errors', () => {
        const raw = '{"errors":[{"message":"Rate limit exceeded","code":429}]}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('429');
        expect(result.message).to.equal('Rate limit exceeded');
    });

    it('should ignore non-3-digit numeric codes', () => {
        const raw = '{"error":{"message":"Something broke","code":42}}';
        const result = formatProviderError(raw);
        expect(result.status).to.be.undefined;
        expect(result.message).to.equal('Something broke');
    });

    it('should ignore non-numeric status strings', () => {
        const raw = '{"error":{"message":"Invalid key","status":"INVALID_ARGUMENT"}}';
        const result = formatProviderError(raw);
        expect(result.status).to.be.undefined;
        expect(result.message).to.equal('Invalid key');
    });

    it('should find JSON preceded by non-JSON text', () => {
        const raw = 'Error occurred: {"error":{"message":"connection refused"}}';
        const result = formatProviderError(raw);
        expect(result.message).to.equal('connection refused');
        expect(result.details).to.be.a('string');
    });

    it('should handle whitespace-only input', () => {
        const result = formatProviderError('   ');
        expect(result.message).to.equal('   ');
        expect(result.status).to.be.undefined;
    });

    it('should walk into a top-level JSON array', () => {
        const raw = '[{"error":{"message":"first"}},{"error":{"message":"second"}}]';
        const result = formatProviderError(raw);
        // walk visits in order, last message wins
        expect(result.message).to.equal('second');
    });

    it('should extract 3-digit status from a longer string value', () => {
        const raw = '{"error":{"message":"Too many requests","status":"429 RESOURCE_EXHAUSTED"}}';
        const result = formatProviderError(raw);
        expect(result.status).to.equal('429');
    });
});

describe('formattedProviderErrorToShortString', () => {

    it('should include status when present', () => {
        const result = formattedProviderErrorToShortString({ status: '401', message: 'Invalid API key', raw: '' });
        expect(result).to.equal('401: Invalid API key');
    });

    it('should return only headline when no status', () => {
        const result = formattedProviderErrorToShortString({ message: 'Something went wrong', raw: '' });
        expect(result).to.equal('Something went wrong');
    });
});
