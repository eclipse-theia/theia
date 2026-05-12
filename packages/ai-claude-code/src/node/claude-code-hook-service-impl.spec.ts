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
        expect(settings.hooks).to.have.property('PostToolUseFailure');
        expect(settings.hooks).to.have.property('PostToolBatch');
        expect(settings.hooks).to.have.property('UserPromptSubmit');
        expect(settings.hooks).to.have.property('PermissionRequest');
        expect(settings.hooks).to.have.property('InstructionsLoaded');
        expect(settings.hooks).to.have.property('ConfigChange');
        expect(settings.hooks).to.have.property('PermissionDenied');
        expect(settings.hooks).to.have.property('StopFailure');
        expect(settings.hooks).to.have.property('Setup');
        expect(settings.hooks).to.have.property('SubagentStart');
        expect(settings.hooks).to.have.property('SubagentStop');
        expect(settings.hooks).to.have.property('TaskCreated');
        expect(settings.hooks).to.have.property('TaskCompleted');
        expect(settings.hooks).to.have.property('TeammateIdle');
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

    it('should return 400 for malformed JSON', async () => {
        const status = await postToCallback(service.getCallbackPort(), 'not json{{{');
        expect(status).to.equal(400);
    });

    it('should handle multiple rapid events in order', async () => {
        const received: AgentSessionHookData[] = [];
        service.onHookEvent(e => received.push(e));

        const events = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd'];
        for (const hookEvent of events) {
            const body = JSON.stringify({ hookEvent, payload: { session_id: 's1' } });
            await postToCallback(service.getCallbackPort(), body);
        }

        expect(received).to.have.length(5);
        expect(received.map(e => e.event)).to.deep.equal(events);
    });

    it('should overwrite theia-callback-hook.js on each install (port may change)', async () => {
        await service.installHooks(tmpDir);
        const hookPath = path.join(tmpDir, '.claude', 'hooks', 'theia-callback-hook.js');
        const content1 = await fs.readFile(hookPath, 'utf8');
        expect(content1).to.include(String(service.getCallbackPort()));

        // Simulate port change by modifying the file and reinstalling
        await fs.writeFile(hookPath, 'old content');
        await service.installHooks(tmpDir);
        const content2 = await fs.readFile(hookPath, 'utf8');
        expect(content2).to.include(String(service.getCallbackPort()));
        expect(content2).to.not.equal('old content');
    });

    it('should not overwrite file-backup-hook.js if it already exists', async () => {
        const hooksDir = path.join(tmpDir, '.claude', 'hooks');
        await fs.mkdir(hooksDir, { recursive: true });
        const hookPath = path.join(hooksDir, 'file-backup-hook.js');
        await fs.writeFile(hookPath, 'custom backup logic');

        await service.installHooks(tmpDir);

        const content = await fs.readFile(hookPath, 'utf8');
        expect(content).to.equal('custom backup logic');
    });

    it('should configure PreToolUse with Write|Edit|MultiEdit matcher', async () => {
        await service.installHooks(tmpDir);
        const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
        const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

        const preToolUse = settings.hooks.PreToolUse[0];
        expect(preToolUse.matcher).to.equal('Write|Edit|MultiEdit');
        expect(preToolUse.hooks[0].command).to.include('file-backup-hook.js');
        expect(preToolUse.hooks[0].timeout).to.equal(10);
    });

    it('should configure callback hooks with THEIA_HOOK_EVENT env var', async () => {
        await service.installHooks(tmpDir);
        const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
        const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

        const notification = settings.hooks.Notification[0];
        expect(notification.hooks[0].command).to.include('THEIA_HOOK_EVENT=Notification');
        expect(notification.hooks[0].command).to.include('theia-callback-hook.js');
    });

    it('should map payload fields to AgentSessionHookData correctly', async () => {
        const received: AgentSessionHookData[] = [];
        service.onHookEvent(e => received.push(e));

        await postToCallback(service.getCallbackPort(), JSON.stringify({
            hookEvent: 'PreToolUse',
            payload: {
                session_id: 'sess-123',
                tool_name: 'Bash',
                tool_input: { command: 'npm test' },
                cwd: '/home/user/project'
            }
        }));

        expect(received[0].sessionId).to.equal('sess-123');
        expect(received[0].toolName).to.equal('Bash');
        expect(received[0].toolInput).to.deep.equal({ command: 'npm test' });
        expect(received[0].payload?.cwd).to.equal('/home/user/project');
    });

    it('should handle missing session_id gracefully', async () => {
        const received: AgentSessionHookData[] = [];
        service.onHookEvent(e => received.push(e));

        await postToCallback(service.getCallbackPort(), JSON.stringify({
            hookEvent: 'Notification',
            payload: { message: 'hello' }
        }));

        expect(received[0].sessionId).to.equal('');
        expect(received[0].payload?.message).to.equal('hello');
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
