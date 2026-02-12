// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics GmbH.
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
import { DefaultLoggerSanitizer } from './logger-sanitizer';

describe('DefaultLoggerSanitizer', () => {
    let sanitizer: DefaultLoggerSanitizer;

    beforeEach(() => {
        sanitizer = new DefaultLoggerSanitizer();
    });

    describe('sanitize', () => {
        it('should mask credentials in http URL', () => {
            const message = 'http://username:password@proxy.example.com:8080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('http://****:****@proxy.example.com:8080');
        });

        it('should mask credentials in https URL', () => {
            const message = 'https://user:pass@secure-proxy.com:443/path';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('https://****:****@secure-proxy.com:443/path');
        });

        it('should return URL unchanged if no credentials present', () => {
            const message = 'http://proxy.example.com:8080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('http://proxy.example.com:8080');
        });

        it('should return empty string for empty string input', () => {
            const sanitized = sanitizer.sanitize('');
            expect(sanitized).to.equal('');
        });

        it('should handle complex passwords with special characters', () => {
            const message = 'http://user:p%40ss%20word@proxy.com:8080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('http://****:****@proxy.com:8080');
        });

        it('should handle URL with path and query parameters', () => {
            const message = 'http://user:pass@proxy.com:8080/path?query=value';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('http://****:****@proxy.com:8080/path?query=value');
        });

        it('should mask credentials in ftp URL', () => {
            const message = 'ftp://user:pass@ftp.example.com';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('ftp://****:****@ftp.example.com');
        });

        it('should mask credentials in URL without port', () => {
            const message = 'https://user:pass@example.com/path';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('https://****:****@example.com/path');
        });

        it('should mask credentials in URL with port', () => {
            const message = 'https://user:pass@example.com:8080/path';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('https://****:****@example.com:8080/path');
        });

        it('should not over-match when text after URL contains @ symbol', () => {
            const message = '\"uri\": \"file:///some/path/my.llamafile\" ... \"@modelcontextprotocol/server-filesystem@latest\"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('\"uri\": \"file:///some/path/my.llamafile\" ... \"@modelcontextprotocol/server-filesystem@latest\"');
        });

        it('should mask credentials in sftp URL', () => {
            const message = 'sftp://user:pass@sftp.example.com:22/path';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('sftp://****:****@sftp.example.com:22/path');
        });

        it('should mask credentials in ssh URL', () => {
            const message = 'ssh://git:token@github.com/repo';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('ssh://****:****@github.com/repo');
        });

        it('should mask credentials in ws URL', () => {
            const message = 'ws://user:pass@websocket.example.com';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('ws://****:****@websocket.example.com');
        });

        it('should mask credentials in wss URL', () => {
            const message = 'wss://user:pass@secure-websocket.example.com';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('wss://****:****@secure-websocket.example.com');
        });

        it('should mask credentials in socks proxy URL', () => {
            const message = 'socks://user:pass@socks-proxy.com:1080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('socks://****:****@socks-proxy.com:1080');
        });

        it('should mask credentials in socks4 proxy URL', () => {
            const message = 'socks4://user:pass@socks4-proxy.com:1080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('socks4://****:****@socks4-proxy.com:1080');
        });

        it('should mask credentials in socks5 proxy URL', () => {
            const message = 'socks5://user:pass@socks5-proxy.com:1080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('socks5://****:****@socks5-proxy.com:1080');
        });

        it('should mask credentials in git URL', () => {
            const message = 'git://user:token@github.com/org/repo.git';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('git://****:****@github.com/org/repo.git');
        });

        it('should not mask mailto links (no credentials format)', () => {
            const message = 'mailto:user@example.com';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('mailto:user@example.com');
        });

        it('should mask credentials in any protocol with standard URL format', () => {
            const message = 'customprotocol://user:pass@custom.server.com';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('customprotocol://****:****@custom.server.com');
        });

        it('should be case-insensitive for protocol', () => {
            const message = 'HTTP://user:pass@proxy.com:8080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('HTTP://****:****@proxy.com:8080');
        });

        it('should mask multiple URLs in a single string', () => {
            const message = 'Connecting to http://user1:pass1@proxy1.com and http://user2:pass2@proxy2.com';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('Connecting to http://****:****@proxy1.com and http://****:****@proxy2.com');
        });

        it('should mask multiple URLs with different protocols', () => {
            const message = 'HTTP: http://u:p@h1.com, SOCKS: socks5://u:p@h2.com, Git: git://u:p@h3.com';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('HTTP: http://****:****@h1.com, SOCKS: socks5://****:****@h2.com, Git: git://****:****@h3.com');
        });

        it('should mask credentials in log messages containing URLs', () => {
            const message = 'Failed to connect to http://admin:secret@internal-proxy.com:8080';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('Failed to connect to http://****:****@internal-proxy.com:8080');
        });

        it('should handle error stack traces with URLs', () => {
            const stack = `Error: Connection failed
    at Request.http://user:pass@proxy.com:8080/api
    at processRequest (index.js:10:5)`;
            const sanitized = sanitizer.sanitize(stack);
            expect(sanitized).to.contain('http://****:****@proxy.com:8080');
            expect(sanitized).not.to.contain('user:pass');
        });

        it('should return message unchanged if no sensitive data', () => {
            const message = 'Normal log message without sensitive data';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal(message);
        });

        it('should mask api_key values in JSON format', () => {
            const message = '"api_key": "secret123"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"api_key": "****"');
        });

        it('should mask API_KEY values in JSON format (case-insensitive)', () => {
            const message = '"API_KEY": "SECRET123"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"API_KEY": "****"');
        });

        it('should mask api-key values in JSON format with hyphen separator', () => {
            const message = '"api-key": "my-token"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"api-key": "****"');
        });

        it('should mask apikey values in JSON format without separator', () => {
            const message = '"apikey": "token123"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"apikey": "****"');
        });

        it('should mask api key in JSON with single quotes', () => {
            const message = "'api_key': 'secret123'";
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal("'api_key': '****'");
        });

        it('should mask prefixed api keys like anthropic_api_key in JSON', () => {
            const message = '"anthropic_api_key": "sk-ant-123456"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"anthropic_api_key": "****"');
        });

        it('should mask prefixed api keys like openai_api_key in JSON', () => {
            const message = '"openai_api_key": "sk-abc123"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"openai_api_key": "****"');
        });

        it('should mask prefixed api keys like GOOGLE_API_KEY in JSON', () => {
            const message = '"GOOGLE_API_KEY": "AIzaSy123"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"GOOGLE_API_KEY": "****"');
        });

        it('should mask multiple api keys in JSON object', () => {
            const message = '{ "anthropic_api_key": "sk-123", "openai_api_key": "sk-456" }';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('{ "anthropic_api_key": "****", "openai_api_key": "****" }');
        });

        it('should mask authtoken values in JSON format without separator', () => {
            const message = '"authtoken": "github_pat_zxzxzxzxzxzxzxzxz"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"authtoken": "****"');
        });

        it('should mask auth_token values in JSON format with underscore separator', () => {
            const message = '"auth_token": "github_pat_zxzxzxzxzxzxzxzxz"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"auth_token": "****"');
        });

        it('should mask auth-token values in JSON format with hyphen separator', () => {
            const message = '"auth-token": "github_pat_zxzxzxzxzxzxzxzxz"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"auth-token": "****"');
        });

        it('should mask serverAuthToken in JSON format', () => {
            const message = '"serverAuthToken": "github_pat_zxzxzxzxzxzxzxzxz"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"serverAuthToken": "****"');
        });

        it('should mask escaped quotes from JSON.stringify', () => {
            const message = '\\"api_key\\": \\"secret123\\"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('\\"api_key\\": \\"****\\"');
        });

        it('should mask dot-notation settings apiKey in JSON', () => {
            const message = '"ai-features.huggingFace.apiKey": "hf_xxxxxxxxxxxx"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"ai-features.huggingFace.apiKey": "****"');
        });

        it('should mask nested settings with apiKey in JSON', () => {
            const message = '"ai-features.openAiOfficial.openAiApiKey": "sk-xxxxxxxx"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"ai-features.openAiOfficial.openAiApiKey": "****"');
        });

        it('should mask settings serverAuthToken in JSON', () => {
            const message = '"serverAuthToken": "ghp_xxxxxxxxxxxx"';
            const sanitized = sanitizer.sanitize(message);
            expect(sanitized).to.equal('"serverAuthToken": "****"');
        });
    });
});
