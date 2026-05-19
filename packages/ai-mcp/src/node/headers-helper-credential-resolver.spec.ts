// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
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
import { MCPCredentialRequest, MCPServerDescription, RemoteMCPServerDescription } from '../common';
import {
    HeadersHelperCredentialResolver,
    runHelper,
} from './headers-helper-credential-resolver';

/**
 * Build a cross-platform shell snippet that emits the given JSON object
 * to stdout. Uses `process.execPath` (the same Node executable that's
 * running these tests) so we don't depend on `echo` quoting and
 * encodes the payload as base64 so its bytes don't include any shell
 * metacharacters (`"`, `'`, `>`, `<`, etc.). Path is double-quoted so
 * Node installations under `Program Files` work on Windows.
 */
function nodeJsonHelper(json: Record<string, unknown>): string {
    const b64 = Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
    return `"${process.execPath}" -e "process.stdout.write(Buffer.from('${b64}','base64').toString('utf8'))"`;
}

const remoteDesc: RemoteMCPServerDescription = {
    name: 'gw',
    serverUrl: 'https://gateway.example.com/mcp',
};

describe('HeadersHelperCredentialResolver', () => {

    const resolver = new HeadersHelperCredentialResolver();

    function trustedRequest(overrides: Partial<MCPCredentialRequest> = {}): MCPCredentialRequest {
        return {
            serverName: 'gw',
            serverUrl: remoteDesc.serverUrl,
            field: 'serverAuthToken',
            workspaceTrustLevel: 'trusted',
            serverDescription: remoteDesc,
            ...overrides,
        };
    }

    describe('runHelper', () => {
        it('returns a parsed JSON object on stdout success', async () => {
            const out = await runHelper(
                nodeJsonHelper({ token: 'abc-123', other: 'x' }),
                'gw',
                'https://example.com',
            );
            expect(out).to.deep.equal({ token: 'abc-123', other: 'x' });
        });

        it('passes MCP_SERVER_NAME and MCP_SERVER_URL to the helper env', async () => {
            const probe = `"${process.execPath}" -e "process.stdout.write(JSON.stringify({n: process.env.MCP_SERVER_NAME, u: process.env.MCP_SERVER_URL}))"`;
            const out = await runHelper(probe, 'github', 'https://api.github.com');
            expect(out).to.deep.equal({ n: 'github', u: 'https://api.github.com' });
        });

        it('returns undefined on non-zero exit', async () => {
            const out = await runHelper(`"${process.execPath}" -e "process.exit(2)"`, 'gw', 'u');
            expect(out).to.be.undefined;
        });

        it('returns undefined on non-JSON stdout', async () => {
            const out = await runHelper(`"${process.execPath}" -e "process.stdout.write('not json')"`, 'gw', 'u');
            expect(out).to.be.undefined;
        });

        it('returns undefined when stdout is a JSON array (not an object)', async () => {
            const out = await runHelper(`"${process.execPath}" -e "process.stdout.write('[1,2,3]')"`, 'gw', 'u');
            expect(out).to.be.undefined;
        });
    });

    describe('resolve()', () => {
        it('abstains when the literal is not a helper sentinel', async () => {
            const result = await resolver.resolve(trustedRequest({
                literal: '${env:GH_TOKEN}',
            }));
            expect(result).to.be.undefined;
        });

        it('abstains when no literal is given', async () => {
            const result = await resolver.resolve(trustedRequest());
            expect(result).to.be.undefined;
        });

        it('abstains when no serverDescription is supplied', async () => {
            const result = await resolver.resolve(trustedRequest({
                serverDescription: undefined,
                literal: '${helper}',
            }));
            expect(result).to.be.undefined;
        });

        it('abstains when the description is local (no headersHelper)', async () => {
            const local: MCPServerDescription = { name: 'l', command: 'echo' };
            const result = await resolver.resolve(trustedRequest({
                serverDescription: local,
                literal: '${helper}',
            }));
            expect(result).to.be.undefined;
        });

        it('abstains when remote description has no headersHelper configured', async () => {
            const result = await resolver.resolve(trustedRequest({
                literal: '${helper}',
            }));
            expect(result).to.be.undefined;
        });

        it('hard-refuses when workspaceTrustLevel is "restricted"', async () => {
            // Use a sentinel that WOULD spawn if trust gate weren't enforced.
            const helperCmd = nodeJsonHelper({ serverAuthToken: 'leaked' });
            const result = await resolver.resolve(trustedRequest({
                workspaceTrustLevel: 'restricted',
                literal: '${helper}',
                serverDescription: { ...remoteDesc, headersHelper: helperCmd },
            }));
            expect(result).to.be.undefined;
        });

        it('hard-refuses when workspaceTrustLevel is "unknown"', async () => {
            const helperCmd = nodeJsonHelper({ serverAuthToken: 'leaked' });
            const result = await resolver.resolve(trustedRequest({
                workspaceTrustLevel: 'unknown',
                literal: '${helper}',
                serverDescription: { ...remoteDesc, headersHelper: helperCmd },
            }));
            expect(result).to.be.undefined;
        });

        it('uses request.field as the JSON key when sentinel is bare `${helper}`', async () => {
            const helperCmd = nodeJsonHelper({ serverAuthToken: 'tok-A', other: 'tok-B' });
            const result = await resolver.resolve(trustedRequest({
                literal: '${helper}',
                serverDescription: { ...remoteDesc, headersHelper: helperCmd },
            }));
            expect(result).to.equal('tok-A');
        });

        it('uses the explicit key when sentinel is `${helper:keyName}`', async () => {
            const helperCmd = nodeJsonHelper({ serverAuthToken: 'tok-A', myKey: 'tok-B' });
            const result = await resolver.resolve(trustedRequest({
                literal: '${helper:myKey}',
                serverDescription: { ...remoteDesc, headersHelper: helperCmd },
            }));
            expect(result).to.equal('tok-B');
        });

        it('abstains when the requested key is missing from helper output', async () => {
            const helperCmd = nodeJsonHelper({ otherKey: 'value' });
            const result = await resolver.resolve(trustedRequest({
                literal: '${helper}',
                serverDescription: { ...remoteDesc, headersHelper: helperCmd },
            }));
            expect(result).to.be.undefined;
        });

        it('abstains when the requested key is non-string (number / object)', async () => {
            const helperCmd = nodeJsonHelper({ serverAuthToken: 42 });
            const result = await resolver.resolve(trustedRequest({
                literal: '${helper}',
                serverDescription: { ...remoteDesc, headersHelper: helperCmd },
            }));
            expect(result).to.be.undefined;
        });
    });
});
