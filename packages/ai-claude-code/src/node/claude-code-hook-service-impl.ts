// *****************************************************************************
// Copyright (C) 2026 Ericsson and Others.
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

import { Emitter, ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { AgentSessionHookData, AgentSessionHookProvider } from '@theia/ai-core';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { HookCallbackEvent, HookEvent, HooksConfig } from '../common/claude-code-hook-types';

/**
 * Claude Code hook provider that:
 * 1. Starts a local HTTP callback server
 * 2. Installs Claude Code hooks (in .claude/settings.local.json) that POST to this server
 * 3. Translates incoming hook callbacks into generic AgentSessionHookData events
 */
@injectable()
export class ClaudeCodeHookServiceImpl implements AgentSessionHookProvider {

    readonly id = 'claude-code';

    @inject(ILogger) @named('ClaudeCode')
    protected readonly logger: ILogger;

    protected readonly hookEmitter = new Emitter<AgentSessionHookData>();
    readonly onHookEvent = this.hookEmitter.event;

    protected server: http.Server;
    protected port = 0;

    @postConstruct()
    protected init(): void {
        this.startCallbackServer();
    }

    getCallbackPort(): number {
        return this.port;
    }

    /**
     * Install Theia-managed hooks into the project's .claude/settings.local.json.
     * Must be called before starting a Claude Code session.
     */
    async installHooks(cwd: string): Promise<void> {
        await this.ensureHookScripts(cwd);
        await this.writeHookSettings(cwd);
    }

    protected startCallbackServer(): void {
        this.server = http.createServer((req, res) => this.handleCallback(req, res));
        this.server.listen(0, '127.0.0.1', () => {
            const addr = this.server.address();
            if (addr && typeof addr !== 'string') {
                this.port = addr.port;
                this.logger.info(`Claude Code hook callback server on port ${this.port}`);
            }
        });
        this.server.on('error', err => this.logger.error('Hook callback server error:', err));
    }

    protected handleCallback(req: http.IncomingMessage, res: http.ServerResponse): void {
        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end();
            return;
        }
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', () => {
            try {
                const event: HookCallbackEvent = JSON.parse(body);
                this.hookEmitter.fire({
                    event: event.hookEvent as AgentSessionHookData['event'],
                    sessionId: event.payload.session_id as string || '',
                    toolName: event.payload.tool_name as string | undefined,
                    toolInput: event.payload.tool_input as Record<string, unknown> | undefined,
                    payload: event.payload
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{}');
            } catch (err) {
                this.logger.error('Failed to parse hook callback:', err);
                res.writeHead(400);
                res.end();
            }
        });
    }

    protected async ensureHookScripts(cwd: string): Promise<void> {
        const hooksDir = path.join(cwd, '.claude', 'hooks');
        await fs.mkdir(hooksDir, { recursive: true });
        await this.writeFileBackupHook(hooksDir);
        await this.writeSessionCleanupHook(hooksDir);
        await this.writeTheiaCallbackHook(hooksDir);
    }

    protected async writeFileBackupHook(hooksDir: string): Promise<void> {
        const hookPath = path.join(hooksDir, 'file-backup-hook.js');
        try { await fs.access(hookPath); return; } catch { /* create */ }
        await fs.writeFile(hookPath, `#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
async function main() {
    const input = await new Promise((resolve, reject) => {
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
    const h = JSON.parse(input);
    if (!['Write','Edit','MultiEdit'].includes(h.tool_name)) process.exit(0);
    let fp = h.tool_name === 'MultiEdit' ? h.tool_input?.files?.[0]?.file_path : h.tool_input?.file_path;
    if (!fp) process.exit(0);
    const abs = path.resolve(h.cwd, fp);
    try { await fs.access(abs); } catch { process.exit(0); }
    const bDir = path.join(h.cwd, '.claude', '.edit-baks', h.session_id);
    const rel = path.relative(h.cwd, abs);
    const bak = path.join(bDir, rel);
    await fs.mkdir(path.dirname(bak), { recursive: true });
    try { await fs.access(bak); process.exit(0); } catch {}
    await fs.copyFile(abs, bak);
}
main().catch(() => process.exit(1));
`, { mode: 0o755 });
    }

    protected async writeSessionCleanupHook(hooksDir: string): Promise<void> {
        const hookPath = path.join(hooksDir, 'session-cleanup-hook.js');
        try { await fs.access(hookPath); return; } catch { /* create */ }
        await fs.writeFile(hookPath, `#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
async function main() {
    const input = await new Promise((resolve, reject) => {
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
    const h = JSON.parse(input);
    const dir = path.join(h.cwd, '.claude', '.edit-baks', h.session_id);
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
}
main().catch(() => process.exit(1));
`, { mode: 0o755 });
    }

    protected async writeTheiaCallbackHook(hooksDir: string): Promise<void> {
        const hookPath = path.join(hooksDir, 'theia-callback-hook.js');
        // Always overwrite — port changes between Theia restarts
        await fs.writeFile(hookPath, `#!/usr/bin/env node
const http = require('http');
async function main() {
    const input = await new Promise((resolve, reject) => {
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
    const hookEvent = process.env.THEIA_HOOK_EVENT || 'Unknown';
    const body = JSON.stringify({ hookEvent, payload: JSON.parse(input) });
    const req = http.request({
        hostname: '127.0.0.1', port: ${this.port}, path: '/hook', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
}
main().catch(() => {});
`, { mode: 0o755 });
    }

    protected async writeHookSettings(cwd: string): Promise<void> {
        const settingsPath = path.join(cwd, '.claude', 'settings.local.json');
        const cb = (event: HookEvent) =>
            `THEIA_HOOK_EVENT=${event} node $CLAUDE_PROJECT_DIR/.claude/hooks/theia-callback-hook.js`;

        const hookConfig: HooksConfig = {
            hooks: {
                PreToolUse: [{
                    matcher: 'Write|Edit|MultiEdit',
                    hooks: [{ type: 'command', command: 'node $CLAUDE_PROJECT_DIR/.claude/hooks/file-backup-hook.js', timeout: 10 }]
                }],
                PostToolUse: [{
                    matcher: 'Write|Edit|MultiEdit',
                    hooks: [{ type: 'command', command: cb('PostToolUse') }]
                }],
                PostToolUseFailure: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('PostToolUseFailure') }]
                }],
                PostToolBatch: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('PostToolBatch') }]
                }],
                UserPromptSubmit: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('UserPromptSubmit') }]
                }],
                PermissionRequest: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('PermissionRequest') }]
                }],
                InstructionsLoaded: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('InstructionsLoaded') }]
                }],
                ConfigChange: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('ConfigChange') }]
                }],
                Notification: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('Notification') }]
                }],
                SessionStart: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('SessionStart') }]
                }],
                SessionEnd: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: cb('SessionEnd') }]
                }],
                Stop: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'node $CLAUDE_PROJECT_DIR/.claude/hooks/session-cleanup-hook.js' }]
                }]
            }
        };

        let existing: Record<string, unknown> = {};
        try {
            existing = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
        } catch { /* doesn't exist */ }

        const merged = { ...existing, ...hookConfig };
        await fs.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.writeFile(settingsPath, JSON.stringify(merged, undefined, 2));
    }
}
