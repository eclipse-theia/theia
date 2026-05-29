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

import { spawn } from 'child_process';
import { injectable } from '@theia/core/shared/inversify';
import {
    MCPCredentialRequest,
    MCPCredentialResolver,
} from '../common/mcp-credential-resolver';
import { isRemoteMCPServerDescription } from '../common/mcp-server-manager';

/**
 * Pattern matching `${helper}` and `${helper:keyName}`. Capture group 1
 * is the explicit JSON key to look up in the helper's output; when
 * absent, the resolver uses the request's `field` as the key.
 *
 * The `keyName` shape mirrors a JSON object key — we accept identifiers
 * but not arbitrary characters, to avoid surprising the user with shell
 * metacharacters that look like sentinel syntax.
 */
const HELPER_SENTINEL_RE = /^\$\{helper(?::([A-Za-z_][A-Za-z0-9_]*))?\}$/;

/**
 * Maximum time we wait for the helper command to produce output before
 * killing it. Five seconds is forgiving enough for vault round-trips
 * but short enough that a misconfigured helper doesn't stall server
 * startup.
 */
const HELPER_TIMEOUT_MS = 5_000;

/**
 * Resolves credentials by invoking an external shell command (the
 * `headersHelper` field on the server description) that emits a JSON
 * object on stdout. Closes the gap between bare `${env:VAR}` (statically
 * resolved at startup, fine for personal dev but awkward for short-lived
 * tokens) and full OAuth (heavy, often handled by an upstream gateway
 * anyway).
 *
 * Sentinel shapes:
 *
 *   - `${helper}`            — invoke the helper, return `output[request.field]`
 *   - `${helper:authToken}`  — invoke the helper, return `output["authToken"]`
 *
 * The helper is invoked with two environment variables so a single
 * helper script can serve multiple servers:
 *
 *   - `MCP_SERVER_NAME` — the configured server name (e.g. `github`)
 *   - `MCP_SERVER_URL`  — the configured `serverUrl`
 *
 * It must write a JSON object to stdout and exit `0`. Non-zero exit,
 * non-JSON output, missing requested key, or a timeout (5 s) all cause
 * the resolver to abstain (return `undefined`), so the chain falls
 * through cleanly to lower-priority resolvers.
 *
 * **Security**: hard-gated on `request.workspaceTrustLevel === 'trusted'`.
 * The helper command is read from server configuration that may live
 * in a workspace settings file; an untrusted workspace must not be
 * able to run arbitrary code via that channel. When the trust level is
 * `'restricted'` or `'unknown'`, the resolver logs a warning and
 * returns `undefined` without spawning anything.
 *
 * Conceptually mirrors `git credential-helper` (helper command writes
 * `key=value` pairs on stdout; consumer reads what it needs) and
 * `kubectl exec-credential` (helper writes a JSON envelope, consumer
 * picks the field). The JSON-object shape was chosen over `key=value`
 * pairs for cleaner Node-side parsing and trivial round-tripping
 * through standard tools (`jq`, `python -c "import json; ..."`).
 *
 * Priority `75` — runs above `EnvCredentialResolver` (50) so a
 * `${helper:...}` sentinel wins over a same-key env-var fallback in
 * the rare case both shapes exist, and below typical OAuth-style
 * resolvers (~100) so plugins can still take precedence.
 */
@injectable()
export class HeadersHelperCredentialResolver implements MCPCredentialResolver {

    readonly id = 'headers-helper';
    readonly priority = 75;

    async resolve(request: MCPCredentialRequest): Promise<string | undefined> {
        const literal = request.literal;
        if (!literal) {
            return undefined;
        }
        const match = literal.match(HELPER_SENTINEL_RE);
        if (!match) {
            return undefined;
        }

        const description = request.serverDescription;
        if (!description || !isRemoteMCPServerDescription(description)) {
            console.warn(
                `[@theia/ai-mcp] HeadersHelperCredentialResolver: ` +
                `${literal} on server "${request.serverName}" requires a remote description; abstaining.`,
            );
            return undefined;
        }

        const helperCommand = description.headersHelper;
        if (!helperCommand) {
            console.warn(
                `[@theia/ai-mcp] HeadersHelperCredentialResolver: server "${request.serverName}" ` +
                `uses ${literal} but does not configure "headersHelper".`,
            );
            return undefined;
        }

        // Hard trust gate. The helper executes arbitrary shell, sourced
        // from server configuration that may be project-scoped — running
        // it in an untrusted workspace is exactly the threat
        // WorkspaceTrustService exists to mitigate.
        if (request.workspaceTrustLevel !== 'trusted') {
            console.warn(
                `[@theia/ai-mcp] HeadersHelperCredentialResolver: refusing to run helper for ` +
                `server "${request.serverName}" — workspace trust level is ` +
                `"${request.workspaceTrustLevel ?? 'unknown'}".`,
            );
            return undefined;
        }

        const lookupKey = match[1] ?? request.field;
        const output = await runHelper(helperCommand, request.serverName, description.serverUrl);
        if (!output) {
            return undefined;
        }
        const value = output[lookupKey];
        if (typeof value !== 'string') {
            console.warn(
                `[@theia/ai-mcp] HeadersHelperCredentialResolver: helper for "${request.serverName}" ` +
                `did not return a string at key "${lookupKey}".`,
            );
            return undefined;
        }
        return value;
    }
}

/**
 * Spawn the helper command via the shell so users can write
 * pipelines / arguments naturally (`get-token --server "$MCP_SERVER_NAME"`).
 * Returns `undefined` on any failure mode (timeout, non-zero exit,
 * non-JSON output) so the resolver chain falls through.
 *
 * Exported for testability.
 */
export function runHelper(
    command: string,
    serverName: string,
    serverUrl: string,
): Promise<Record<string, unknown> | undefined> {
    return new Promise(resolve => {
        const child = spawn(command, [], {
            shell: true,
            env: {
                ...process.env,
                MCP_SERVER_NAME: serverName,
                MCP_SERVER_URL: serverUrl,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const chunks: Buffer[] = [];
        const errChunks: Buffer[] = [];
        let settled = false;
        const settle = (value: Record<string, unknown> | undefined) => {
            if (settled) { return; }
            settled = true;
            resolve(value);
        };

        const timer = setTimeout(() => {
            console.warn(
                `[@theia/ai-mcp] HeadersHelperCredentialResolver: helper for "${serverName}" ` +
                `did not produce output within ${HELPER_TIMEOUT_MS}ms; killing.`,
            );
            child.kill('SIGTERM');
            settle(undefined);
        }, HELPER_TIMEOUT_MS);

        child.stdout?.on('data', c => chunks.push(c));
        child.stderr?.on('data', c => errChunks.push(c));
        child.on('error', err => {
            clearTimeout(timer);
            console.warn(
                `[@theia/ai-mcp] HeadersHelperCredentialResolver: helper for "${serverName}" failed to start:`,
                err,
            );
            settle(undefined);
        });
        child.on('close', code => {
            clearTimeout(timer);
            if (code !== 0) {
                const stderr = Buffer.concat(errChunks).toString('utf8').trim();
                console.warn(
                    `[@theia/ai-mcp] HeadersHelperCredentialResolver: helper for "${serverName}" ` +
                    `exited with code ${code}.${stderr ? ` stderr: ${stderr}` : ''}`,
                );
                settle(undefined);
                return;
            }
            const stdout = Buffer.concat(chunks).toString('utf8').trim();
            try {
                const parsed = JSON.parse(stdout);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    settle(parsed as Record<string, unknown>);
                } else {
                    console.warn(
                        `[@theia/ai-mcp] HeadersHelperCredentialResolver: helper for "${serverName}" ` +
                        `did not return a JSON object.`,
                    );
                    settle(undefined);
                }
            } catch (err) {
                console.warn(
                    `[@theia/ai-mcp] HeadersHelperCredentialResolver: helper for "${serverName}" ` +
                    `returned non-JSON output:`,
                    err,
                );
                settle(undefined);
            }
        });
    });
}

