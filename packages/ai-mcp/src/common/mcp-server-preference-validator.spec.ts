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
    filterValidValues,
    isHttpOrHttpsUrl,
    MCPServersPreference
} from './mcp-server-preference-validator';

/**
 * Captures the diagnostic that `filterValidValues` writes to `console.warn` for a single probe entry.
 * Returns the diagnostic string for an invalid entry, or `undefined` for a valid entry.
 */
function reasonFor(value: unknown): string | undefined {
    let captured: string | undefined;
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
        if (args.length >= 2 && typeof args[1] === 'string') {
            captured = args[1];
        }
    };
    try {
        filterValidValues({ probe: value });
    } finally {
        console.warn = originalWarn;
    }
    return captured;
}

describe('MCPServersPreference validator', () => {

    describe('isHttpOrHttpsUrl', () => {
        it('accepts a fully qualified https URL', () => {
            expect(isHttpOrHttpsUrl('https://auth.example.com')).to.be.true;
        });

        it('accepts a fully qualified http URL', () => {
            expect(isHttpOrHttpsUrl('http://auth.example.com')).to.be.true;
        });

        it('accepts a URL with a path and query', () => {
            expect(isHttpOrHttpsUrl('https://auth.example.com/oauth?foo=bar')).to.be.true;
        });

        it('rejects an unparseable string', () => {
            expect(isHttpOrHttpsUrl('not a url')).to.be.false;
        });

        it('rejects an empty string', () => {
            expect(isHttpOrHttpsUrl('')).to.be.false;
        });

        it('rejects a javascript: URL', () => {
            expect(isHttpOrHttpsUrl('javascript:alert(1)')).to.be.false;
        });

        it('rejects a data: URL', () => {
            expect(isHttpOrHttpsUrl('data:text/html,<script>alert(1)</script>')).to.be.false;
        });

        it('rejects a file: URL', () => {
            expect(isHttpOrHttpsUrl('file:///etc/passwd')).to.be.false;
        });
    });

    describe('filterValidValues diagnostics', () => {
        it('flags a non-object value', () => {
            expect(reasonFor('not-an-object')).to.contain('JSON object');
        });

        it('flags missing command/serverUrl', () => {
            expect(reasonFor({})).to.contain('required');
        });

        it('flags both command and serverUrl on the same entry', () => {
            expect(reasonFor({ command: 'node', serverUrl: 'https://mcp.example.com/mcp' })).to.contain('not both');
        });

        it('flags oauth on a local server', () => {
            expect(reasonFor({ command: 'node', oauth: {} })).to.contain('only valid for remote');
        });

        it('flags serverAuthToken + OAuth conflict', () => {
            expect(reasonFor({
                serverUrl: 'https://mcp.example.com/mcp',
                serverAuthToken: 'token',
                oauth: {}
            })).to.contain('not both');
        });

        it('flags an unparseable oauth.authorizationServer URL', () => {
            const reason = reasonFor({
                serverUrl: 'https://mcp.example.com/mcp',
                oauth: { authorizationServer: 'not-a-url' }
            });
            expect(reason).to.contain('oauth.authorizationServer');
            expect(reason).to.contain('http(s) URL');
        });

        it('flags a non-http oauth.authorizationServer URL', () => {
            const reason = reasonFor({
                serverUrl: 'https://mcp.example.com/mcp',
                oauth: { authorizationServer: 'javascript:alert(1)' }
            });
            expect(reason).to.contain('oauth.authorizationServer');
            expect(reason).to.contain('http(s) URL');
        });

        it('flags an unparseable oauth.resource URL', () => {
            const reason = reasonFor({
                serverUrl: 'https://mcp.example.com/mcp',
                oauth: { resource: 'not-a-url' }
            });
            expect(reason).to.contain('oauth.resource');
            expect(reason).to.contain('http(s) URL');
        });

        it('flags a non-string command', () => {
            expect(reasonFor({ command: 123 })).to.contain('"command" must be a string');
        });

        it('flags a non-string oauth.clientId with the generic oauth diagnostic', () => {
            const reason = reasonFor({
                serverUrl: 'https://mcp.example.com/mcp',
                oauth: { clientId: 42 }
            });
            expect(reason).to.contain('"oauth"');
        });

        it('flags scopes that are not all strings with the generic oauth diagnostic', () => {
            const reason = reasonFor({
                serverUrl: 'https://mcp.example.com/mcp',
                oauth: { scopes: ['read', 42] }
            });
            expect(reason).to.contain('"oauth"');
        });

        it('produces no diagnostic for a valid entry', () => {
            expect(reasonFor({ command: 'node' })).to.be.undefined;
        });

        it('produces no diagnostic for a remote entry with an empty oauth object (presence enables OAuth)', () => {
            expect(reasonFor({ serverUrl: 'https://mcp.example.com/mcp', oauth: {} })).to.be.undefined;
        });

        it('treats an explicit null oauth as absent on a local server (user-authored JSON may serialize this way)', () => {
            // eslint-disable-next-line no-null/no-null
            expect(reasonFor({ command: 'node', oauth: null })).to.be.undefined;
        });

        it('flags a non-string cwd', () => {
            expect(reasonFor({ command: 'node', cwd: 42 })).to.contain('"cwd" must be a string');
        });

        it('flags a non-string pluginRoot', () => {
            expect(reasonFor({ command: 'node', pluginRoot: 42 })).to.contain('"pluginRoot" must be a string');
        });

        it('flags a non-string pluginData', () => {
            expect(reasonFor({ command: 'node', pluginData: 42 })).to.contain('"pluginData" must be a string');
        });

        it('flags a registryMetadata block that identifies neither a registry server nor an Agent Plugin', () => {
            expect(reasonFor({ command: 'node', registryMetadata: { version: '1.0.0' } })).to.contain('registryMetadata');
        });
    });

    describe('filterValidValues', () => {
        it('keeps valid entries and drops invalid ones', () => {
            const originalConsoleWarn = console.warn;
            const warnings: unknown[][] = [];
            console.warn = (...args: unknown[]) => { warnings.push(args); };
            try {
                const result = filterValidValues({
                    'good-local': { command: 'node' },
                    'good-remote': { serverUrl: 'https://mcp.example.com/mcp' },
                    'missing-command-and-url': { autostart: true },
                    'bad-oauth-url': {
                        serverUrl: 'https://mcp.example.com/mcp',
                        oauth: { authorizationServer: 'not-a-url' }
                    }
                });
                expect(Object.keys(result)).to.have.members(['good-local', 'good-remote']);
                // Each invalid entry must produce a diagnostic so users can see why their config was dropped.
                expect(warnings).to.have.length(2);
            } finally {
                console.warn = originalConsoleWarn;
            }
        });

        it('returns an empty object for a non-object input', () => {
            expect(filterValidValues('not-an-object')).to.deep.equal({});
        });

        it('returns an empty object for undefined', () => {
            expect(filterValidValues(undefined)).to.deep.equal({});
        });
    });

    describe('MCPServersPreference.isValue', () => {
        it('accepts a valid local entry', () => {
            expect(MCPServersPreference.isValue({ command: 'node' })).to.be.true;
        });

        it('accepts a valid remote OAuth entry', () => {
            expect(MCPServersPreference.isValue({ serverUrl: 'https://mcp.example.com/mcp', oauth: {} })).to.be.true;
        });

        it('rejects an entry with both command and serverUrl', () => {
            expect(MCPServersPreference.isValue({ command: 'node', serverUrl: 'https://mcp.example.com/mcp' })).to.be.false;
        });

        it('rejects a remote entry combining serverAuthToken with oauth', () => {
            expect(MCPServersPreference.isValue({ serverUrl: 'https://mcp.example.com/mcp', serverAuthToken: 'token', oauth: {} })).to.be.false;
        });

        it('rejects a non-object value', () => {
            expect(MCPServersPreference.isValue('not-an-object')).to.be.false;
        });

        it('accepts a local entry carrying cwd, pluginRoot and pluginData', () => {
            expect(MCPServersPreference.isValue({
                command: './bin/validator',
                cwd: '/home/alex/.agents/plugins/devtools',
                pluginRoot: '/home/alex/.agents/plugins/devtools',
                pluginData: '/home/alex/.agents/plugins/data/devtools'
            })).to.be.true;
        });

        it('accepts an entry whose registryMetadata carries a pluginId and no serverId', () => {
            expect(MCPServersPreference.isValue({
                command: 'npx',
                registryMetadata: { pluginId: 'io.github.acme/devtools', version: '1.0.0' }
            })).to.be.true;
        });

        it('still accepts an entry whose registryMetadata carries only a serverId', () => {
            expect(MCPServersPreference.isValue({
                command: 'npx',
                registryMetadata: { serverId: 'io.github.acme/brave-search', configHash: 'abc' }
            })).to.be.true;
        });

        it('rejects a registryMetadata block with neither serverId nor pluginId', () => {
            expect(MCPServersPreference.isValue({ command: 'npx', registryMetadata: { version: '1.0.0' } })).to.be.false;
        });

        it('rejects a registryMetadata block whose pluginId is not a string', () => {
            expect(MCPServersPreference.isValue({ command: 'npx', registryMetadata: { pluginId: 42 } })).to.be.false;
        });

        it('rejects a plugin-provided entry that also declares a serverUrl, keeping the local/remote discriminator intact', () => {
            expect(MCPServersPreference.isValue({
                command: 'npx',
                serverUrl: 'https://mcp.example.com/mcp',
                registryMetadata: { pluginId: 'io.github.acme/devtools' }
            })).to.be.false;
        });

        it('rejects a plugin-provided local entry that declares oauth', () => {
            expect(MCPServersPreference.isValue({
                command: 'npx',
                oauth: {},
                registryMetadata: { pluginId: 'io.github.acme/devtools' }
            })).to.be.false;
        });

        it('rejects a local entry whose pluginRoot is not a string', () => {
            expect(MCPServersPreference.isValue({ command: 'npx', pluginRoot: 42 })).to.be.false;
        });
    });
});
