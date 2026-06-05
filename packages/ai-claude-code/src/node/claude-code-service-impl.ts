// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ILogger, generateUuid, nls } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { execSync } from 'child_process';
import { existsSync, realpathSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
    ClaudeCodeBackendRequest,
    ClaudeCodeClient,
    ClaudeCodeService,
    ToolApprovalRequestMessage,
    ToolApprovalResponseMessage
} from '../common/claude-code-service';

interface ToolApprovalResult {
    behavior: 'allow' | 'deny';
    message?: string;
    updatedInput?: unknown;
}

@injectable()
export class ClaudeCodeServiceImpl implements ClaudeCodeService {

    @inject(ILogger) @named('ClaudeCode')
    private logger: ILogger;

    private client: ClaudeCodeClient;
    private abortControllers = new Map<string, AbortController>();
    private pendingApprovals = new Map<string, (result: ToolApprovalResult) => void>();

    // Tools that don't require approval - they are safe and non-intrusive
    protected readonly autoApprovedTools = new Set<string>();

    setClient(client: ClaudeCodeClient): void {
        this.client = client;
    }

    async send(request: ClaudeCodeBackendRequest, streamId: string): Promise<void> {
        if (!this.client) {
            throw new Error('Claude Code client not initialized');
        }
        this.sendMessages(streamId, request);
    }

    protected isApiKeyError(message: unknown): boolean {
        if (typeof message === 'object' && message) {
            // Check if this is a result message with the API key error
            const resultMessage = message as {
                type?: string;
                result?: string;
                is_error?: boolean;
                usage?: { input_tokens?: number; output_tokens?: number };
            };
            if (resultMessage.type === 'result' && resultMessage.is_error && resultMessage.result) {
                const hasErrorText = resultMessage.result.includes('Invalid API key') && resultMessage.result.includes('/login');
                // Additional check: error results typically have zero token usage
                const hasZeroUsage = resultMessage.usage?.input_tokens === 0 && resultMessage.usage?.output_tokens === 0;
                return hasErrorText && (hasZeroUsage || !resultMessage.usage);
            }

            // Check if this is an assistant message with the API key error
            // These messages have model: "<synthetic>" to indicate they're error messages
            const assistantMessage = message as {
                type?: string;
                message?: {
                    model?: string;
                    role?: string;
                    usage?: { input_tokens?: number; output_tokens?: number };
                    content?: Array<{ type?: string; text?: string }>;
                };
            };
            if (assistantMessage.type === 'assistant' &&
                assistantMessage.message?.model === '<synthetic>' &&
                assistantMessage.message?.role === 'assistant' &&
                assistantMessage.message?.content) {
                const hasErrorText = assistantMessage.message.content.some(content =>
                    content.type === 'text' && content.text &&
                    content.text.includes('Invalid API key') && content.text.includes('/login')
                );
                // Additional check: synthetic error messages have zero token usage
                const usage = assistantMessage.message.usage;
                const hasZeroUsage = usage?.input_tokens === 0 && usage?.output_tokens === 0;
                return hasErrorText && (hasZeroUsage || !usage);
            }
        }
        return false;
    }

    protected async sendMessages(streamId: string, request: ClaudeCodeBackendRequest): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(streamId, abortController);

        try {
            const cwd = request.options?.cwd || process.cwd();
            await this.ensureFileBackupHook(cwd);
            await this.ensureStopHook(cwd);
            await this.ensureClaudeSettings(cwd);

            let done = (_?: unknown) => { };
            const receivedResult = new Promise(resolve => {
                done = resolve;
            });

            const apiKey = request.apiKey || process.env.ANTHROPIC_API_KEY;
            const { query, SDKUserMessage, Options } = await this.importClaudeCodeSDK(request.claudeCodePath);

            const stream = (query as Function)({
                prompt: (async function* (): AsyncGenerator<typeof SDKUserMessage> {
                    yield {
                        type: 'user',
                        message: {
                            role: 'user',
                            content: request.prompt
                        },
                        // eslint-disable-next-line no-null/no-null
                        parent_tool_use_id: null,
                        session_id: generateUuid()
                    };
                    await receivedResult;
                })(),
                options: <typeof Options>{
                    ...request.options,
                    abortController,
                    cwd,
                    settingSources: ['user', 'project', 'local'],
                    canUseTool: (toolName: string, toolInput: unknown) => this.requestToolApproval(streamId, toolName, toolInput),
                    env: { ...process.env, ANTHROPIC_API_KEY: apiKey, NODE_OPTIONS: '' },
                    stderr: (data: unknown) => {
                        let message = String(data);

                        // The current claude code CLI is quite verbose and outputs a lot of
                        // non-error info to stderr when spawning.
                        // We check for this and log it at debug level instead.
                        if (message.startsWith('Spawning Claude Code process:')) {
                            // Strip the system prompt if present
                            if (request.options?.appendSystemPrompt) {
                                const systemPrompt = request.options.appendSystemPrompt;
                                message = message.replace(systemPrompt, '').trim();
                            }

                            // Check if the remainder looks like it contains an actual error
                            if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
                                this.logger.error('Claude Code Std Error:', message);
                            } else {
                                this.logger.debug('Claude Code Verbose Output:', message);
                            }
                            return;
                        }

                        // Log all other content as error (actual errors)
                        this.logger.error('Claude Code Std Error:', message);
                    },
                }
            });

            for await (const message of stream) {
                // Check for API key error and handle it
                if (this.isApiKeyError(message)) {
                    // If this is the result message, send the custom error and stop
                    if (message.type === 'result') {
                        const errorMessage = nls.localize('theia/ai/claude-code/apiKeyError',
                            'Please set a Claude Code API key in the preferences or log into Claude Code on your machine.');
                        this.client.sendError(streamId, new Error(errorMessage));
                        done();
                        break;
                    }
                    // If this is an assistant message with the error, skip it (don't send to client)
                    continue;
                }
                this.client.sendToken(streamId, message);
                if (message.type === 'result' || abortController.signal.aborted) {
                    done();
                    break;
                }
            }
            // Signal stream completion by returning undefined
            abortController.abort('closed after result');
            this.client.sendToken(streamId, undefined);
        } catch (e) {
            this.logger.error('Claude Code error:', e);
            this.client.sendError(streamId, e instanceof Error ? e : new Error(String(e)));
        } finally {
            this.abortControllers.delete(streamId);
        }
    }

    /**
     * Dynamically imports the Claude Code SDK from the local installation.
     * @param customClaudeCodePath Optional custom path to Claude Code executable (cli.js)
     * @returns An object containing the SDK's query function, user message type, and options type.
     */
    protected async importClaudeCodeSDK(customClaudeCodePath?: string): Promise<{ query: unknown; SDKUserMessage: unknown; Options: unknown }> {
        let claudeCodePath: string;

        if (customClaudeCodePath) {
            if (!existsSync(customClaudeCodePath)) {
                throw new Error(nls.localize('theia/ai/claude-code/executableNotFoundAt', 'Specified Claude Code executable not found at: {0}', customClaudeCodePath));
            }
            const realPath = realpathSync(customClaudeCodePath);
            // Use the directory containing the cli.js file
            claudeCodePath = path.dirname(realPath);
        } else {
            claudeCodePath = this.resolveClaudeCodePath();
        }

        const sdkPath = path.join(claudeCodePath, 'sdk.mjs');

        // Check if file exists before importing
        if (!existsSync(sdkPath)) {
            throw new Error(nls.localize('theia/ai/claude-code/installationNotFoundAt', 'Claude Code installation not found. ' +
                'Please install with: `npm install -g @anthropic-ai/claude-agent-sdk` ' +
                'and/or specify the path to the executable in the settings. ' +
                'We looked at {0}', sdkPath));
        }

        const importPath = `file://${sdkPath}`;
        // We can not use dynamic import directly because webpack will try to
        // bundle the module at build time, which we don't want.
        // We also can't use a webpack ignore comment because the comment is stripped
        // during the build and then webpack still tries to resolve the module.
        const dynamicImport = new Function('path', 'return import(path)');
        return dynamicImport(importPath);
    }

    protected resolveClaudeCodePath(): string {
        try {
            const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
            return path.join(globalPath, '@anthropic-ai/claude-agent-sdk');
        } catch (error) {
            this.logger.error('Failed to resolve global npm path:', error);
            throw new Error(nls.localize('theia/ai/claude-code/installationNotFound', 'Claude Code installation not found. ' +
                'Please install with: `npm install -g @anthropic-ai/claude-agent-sdk` ' +
                'and/or specify the path to the executable in the settings.'));
        }
    }

    cancel(streamId: string): void {
        const abortController = this.abortControllers.get(streamId);
        if (abortController) {
            abortController.abort('user canceled');
            this.abortControllers.delete(streamId);
        }
    }

    handleApprovalResponse(response: ToolApprovalResponseMessage): void {
        const resolver = this.pendingApprovals.get(response.requestId);
        if (resolver) {
            resolver({
                behavior: response.approved ? 'allow' : 'deny',
                message: response.message,
                updatedInput: response.updatedInput
            });
        }
    }

    protected async requestToolApproval(streamId: string, toolName: string, toolInput: unknown): Promise<{ behavior: 'allow' | 'deny', message?: string, updatedInput?: unknown }> {
        if (this.autoApprovedTools.has(toolName)) {
            // Ensure updatedInput is a valid object (Zod expects a record, not undefined)
            const validInput = (toolInput && typeof toolInput === 'object') ? toolInput : {};
            const res = { behavior: 'allow' as const, updatedInput: validInput };
            this.logger.info('Auto-approving non-intrusive tool:', toolName);
            return res;
        }

        this.logger.info('Requesting tool approval:', toolName, toolInput);

        const requestId = generateUuid();
        const approvalRequest: ToolApprovalRequestMessage = {
            type: 'tool-approval-request',
            toolName,
            toolInput,
            requestId
        };

        this.client.sendToken(streamId, approvalRequest);

        const approvalPromise = new Promise<ToolApprovalResult>(resolve => {
            this.pendingApprovals.set(requestId, resolve);
        });

        const result = await approvalPromise;
        this.pendingApprovals.delete(requestId);

        return result;
    }

    protected async ensureStopHook(cwd: string): Promise<void> {
        const hookPath = path.join(cwd, '.claude', 'hooks', 'session-cleanup-hook.js');

        try {
            await fs.access(hookPath);
            return;
        } catch {
            // Hook doesn't exist, create it
        }

        await fs.mkdir(path.dirname(hookPath), { recursive: true });

        const hookContent = `#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function main() {
    try {
        const input = await new Promise((resolve, reject) => {
            let data = '';
            process.stdin.on('data', chunk => data += chunk);
            process.stdin.on('end', () => resolve(data));
            process.stdin.on('error', reject);
        });

        const hookData = JSON.parse(input);

        // Delete backup directory for this session
        const backupDir = path.join(hookData.cwd, '.claude', '.edit-baks', hookData.session_id);

        try {
            await fs.rm(backupDir, { recursive: true, force: true });
            console.log(\`Cleaned up session backups: \${hookData.session_id}\`);
        } catch (error) {
            // Directory might not exist, which is fine
            console.log(\`No backups to clean for session: \${hookData.session_id}\`);
        }

    } catch (error) {
        console.error(\`Cleanup failed: \${error.message}\`, process.stderr);
        process.exit(1);
    }
}

main();
`;

        await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
    }

    protected async ensureFileBackupHook(cwd: string): Promise<void> {
        const hookPath = path.join(cwd, '.claude', 'hooks', 'file-backup-hook.js');

        try {
            await fs.access(hookPath);
            // Hook already exists, no need to create it
            return;
        } catch {
            // Hook doesn't exist, create it
        }

        // Ensure the hooks directory exists
        await fs.mkdir(path.dirname(hookPath), { recursive: true });

        const hookContent = `#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function main() {
    try {
        // Read input from stdin
        const input = await new Promise((resolve, reject) => {
            let data = '';
            process.stdin.on('data', chunk => data += chunk);
            process.stdin.on('end', () => resolve(data));
            process.stdin.on('error', reject);
        });

        const hookData = JSON.parse(input);

        // Only backup for file modification tools
        const fileModifyingTools = ['Write', 'Edit', 'MultiEdit'];
        if (!fileModifyingTools.includes(hookData.tool_name)) {
            process.exit(0);
        }

        // Extract file path from tool input
        let filePath;
        if (hookData.tool_name === 'Write' || hookData.tool_name === 'Edit') {
            filePath = hookData.tool_input?.file_path;
        } else if (hookData.tool_name === 'MultiEdit') {
            // MultiEdit has multiple files - we'll handle the first one for now
            // You might want to extend this to handle all files
            filePath = hookData.tool_input?.files?.[0]?.file_path;
        }

        if (!filePath) {
            process.exit(0);
        }

        // Resolve absolute path
        const absoluteFilePath = path.resolve(hookData.cwd, filePath);

        // Check if file exists (can't backup what doesn't exist)
        try {
            await fs.access(absoluteFilePath);
        } catch {
            // File doesn't exist, nothing to backup
            process.exit(0);
        }

        // Create backup directory structure
        const backupDir = path.join(hookData.cwd, '.claude', '.edit-baks', hookData.session_id);
        await fs.mkdir(backupDir, { recursive: true });

        // Create backup file path (maintain relative structure)
        const relativePath = path.relative(hookData.cwd, absoluteFilePath);
        const backupFilePath = path.join(backupDir, relativePath);

        // Ensure backup subdirectories exist
        await fs.mkdir(path.dirname(backupFilePath), { recursive: true });

        // Only create backup if it doesn't already exist for this session
        try {
            await fs.access(backupFilePath);
            // Backup already exists for this session, don't overwrite
            process.exit(0);
        } catch {
            // Backup doesn't exist, create it
        }

        // Copy the file
        await fs.copyFile(absoluteFilePath, backupFilePath);

        // Optional: Log the backup (visible in transcript mode with Ctrl-R)
        console.log(\`Backed up: \${relativePath}\`);

    } catch (error) {
        console.error(\`Backup failed: \${error.message}\`, process.stderr);
        process.exit(1); // Non-blocking error
    }
}

main();
`;

        await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
    }

    private async ensureClaudeSettings(cwd: string): Promise<void> {
        const settingsPath = path.join(cwd, '.claude', 'settings.local.json');

        const hookConfig = {
            hooks: {
                PreToolUse: [
                    {
                        matcher: 'Write|Edit|MultiEdit',
                        hooks: [
                            {
                                type: 'command',
                                command: 'node $CLAUDE_PROJECT_DIR/.claude/hooks/file-backup-hook.js',
                                timeout: 10
                            }
                        ]
                    }
                ],
                Stop: [
                    {
                        matcher: '',
                        hooks: [
                            {
                                type: 'command',
                                command: 'node $CLAUDE_PROJECT_DIR/.claude/hooks/session-cleanup-hook.js'
                            }
                        ]
                    }
                ]
            }
        };

        try {
            // Try to read existing settings
            const existingContent = await fs.readFile(settingsPath, 'utf8');
            const existingSettings = JSON.parse(existingContent);

            // Check if hooks already exist and are properly configured
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hasPreHook = existingSettings.hooks?.PreToolUse?.some((hook: any) =>
                hook.matcher === 'Write|Edit|MultiEdit' &&
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                hook.hooks?.some((h: any) => h.command?.includes('file-backup-hook.js'))
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hasStopHook = existingSettings.hooks?.Stop?.some((hook: any) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                hook.hooks?.some((h: any) => h.command?.includes('session-cleanup-hook.js'))
            );

            if (hasPreHook && hasStopHook) {
                // Hooks already configured, no need to modify
                return;
            }

            // Merge with existing settings
            const mergedSettings = {
                ...existingSettings,
                hooks: {
                    ...existingSettings.hooks,
                    PreToolUse: [
                        ...(existingSettings.hooks?.PreToolUse || []),
                        ...(hasPreHook ? [] : hookConfig.hooks.PreToolUse)
                    ],
                    Stop: [
                        ...(existingSettings.hooks?.Stop || []),
                        ...(hasStopHook ? [] : hookConfig.hooks.Stop)
                    ]
                }
            };

            await fs.writeFile(settingsPath, JSON.stringify(mergedSettings, undefined, 2));
        } catch {
            // File doesn't exist or is invalid JSON, create new one
            await fs.mkdir(path.dirname(settingsPath), { recursive: true });
            await fs.writeFile(settingsPath, JSON.stringify(hookConfig, undefined, 2));
        }
    }
}
