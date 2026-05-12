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

import { expect } from 'chai';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentSessionHookData } from '@theia/ai-core';
import { ClaudeCodeHookServiceImpl } from './claude-code-hook-service-impl';

describe('ClaudeCodeHookServiceImpl', () => {

    let service: ClaudeCodeHookServiceImpl;
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'theia-hook-test-'));
        service = new ClaudeCodeHookServiceImpl();
        // Mock logger
        (service as any).logger = { info: () => { }, error: () => { }, debug: () => { } };
        service['init']();
        // Wait for server to start
        await new Promise<void>(resolve => setTimeout(resolve, 50));
    });

    afterEach(async () => {
        service['server']?.close();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should have id "claude-code"', () => {
        expect(service.id).to.equal('claude-code');
    });

    it('should start callback server on a port', () => {
        expect(service.getCallbackPort()).to.be.greaterThan(0);
    });

    it('should emit hook events when callback server receives POST', async () => {
        const received: AgentSessionHookData[] = [];
        service.onHookEvent(e => received.push(e));

        const body = JSON.stringify({
            hookEvent: 'PostToolUse',
            payload: { session_id: 'test-session', tool_name: 'Write', tool_input: { file_path: 'foo.ts' } }
        });

        await postToCallback(service.getCallbackPort(), body);

        expect(received).to.have.length(1);
        expect(received[0].event).to.equal('PostToolUse');
        expect(received[0].sessionId).to.equal('test-session');
        expect(received[0].toolName).to.equal('Write');
    });

    it('should reject non-POST requests', async () => {
        const status = await getFromCallback(service.getCallbackPort());
        expect(status).to.equal(405);
    });

    it('should install hook scripts and settings', async () => {
        // Override port so the generated script has a valid port
        await service.installHooks(tmpDir);

        const hooksDir = path.join(tmpDir, '.claude', 'hooks');
        const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');

        // Check scripts exist
        await fs.access(path.join(hooksDir, 'file-backup-hook.js'));
        await fs.access(path.join(hooksDir, 'session-cleanup-hook.js'));
        await fs.access(path.join(hooksDir, 'theia-callback-hook.js'));

        // Check settings
        const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
        expect(settings.hooks).to.have.property('PreToolUse');
        expect(settings.hooks).to.have.property('PostToolUse');
        expect(settings.hooks).to.have.property('Notification');
        expect(settings.hooks).to.have.property('SessionStart');
        expect(settings.hooks).to.have.property('SessionEnd');
        expect(settings.hooks).to.have.property('Stop');
    });

    it('should preserve existing settings when installing hooks', async () => {
        const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
        await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
        await fs.writeFile(settingsPath, JSON.stringify({ customSetting: true }));

        await service.installHooks(tmpDir);

        const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
        expect(settings.customSetting).to.equal(true);
        expect(settings.hooks).to.have.property('PreToolUse');
    });
});

function postToCallback(port: number, body: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => { resolve(res.statusCode || 0); });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function getFromCallback(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port, path: '/hook', method: 'GET'
        }, res => { resolve(res.statusCode || 0); });
        req.on('error', reject);
        req.end();
    });
}
