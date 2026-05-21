// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { QaapDeployEnvVar, QaapDeployRunRequest, QaapDeployRunResponse } from '../common/qaap-cloud-api-types';

@injectable()
export class QaapDeployRunner {

    async run(request: QaapDeployRunRequest): Promise<QaapDeployRunResponse> {
        const envMap = await this.loadEnv(request.workspaceKey);
        const env = { ...process.env, ...Object.fromEntries(envMap.entries()) };
        if (request.provider === 'vercel') {
            return this.runCli(request, env, [
                'npx', '--yes', 'vercel', 'deploy', '--prod', '--yes',
                ...(request.projectName ? ['--name', request.projectName] : []),
            ]);
        }
        const project = request.projectName ?? 'qaap-app';
        const dist = path.join(request.workspaceRoot, 'dist');
        const outDir = await fs.stat(dist).then(() => './dist').catch(() => '.');
        return this.runCli(request, env, [
            'npx', '--yes', 'wrangler', 'pages', 'deploy', outDir,
            `--project-name=${project}`,
        ]);
    }

    protected async runCli(
        request: QaapDeployRunRequest,
        env: NodeJS.ProcessEnv,
        command: string[],
    ): Promise<QaapDeployRunResponse> {
        const [bin, ...args] = command;
        const { stdout, stderr, exitCode } = await this.exec(bin, args, {
            cwd: request.workspaceRoot,
            env,
            timeoutMs: 600_000,
        });
        const deployUrl = this.extractUrl(stdout + '\n' + stderr);
        return {
            ok: exitCode === 0,
            provider: request.provider,
            exitCode,
            stdout: truncate(stdout),
            stderr: truncate(stderr),
            deployUrl,
        };
    }

    protected extractUrl(output: string): string | undefined {
        const match = output.match(/https:\/\/[^\s)]+/);
        return match?.[0];
    }

    protected deployEnvPath(workspaceKey: string): string {
        const safe = workspaceKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
        return `${process.env.HOME ?? ''}/.qaap/deploy-env/${safe}.json`;
    }

    protected async loadEnv(workspaceKey: string): Promise<Map<string, string>> {
        try {
            const raw = await fs.readFile(this.deployEnvPath(workspaceKey), 'utf8');
            const parsed = JSON.parse(raw) as { vars?: QaapDeployEnvVar[] };
            const vars = Array.isArray(parsed.vars) ? parsed.vars : [];
            return new Map(vars.filter(v => v.key?.trim()).map(v => [v.key, v.value]));
        } catch {
            return new Map();
        }
    }

    protected exec(
        command: string,
        args: string[],
        options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        return new Promise(resolve => {
            const child = spawn(command, args, {
                cwd: options.cwd,
                env: options.env,
                shell: false,
            });
            let stdout = '';
            let stderr = '';
            child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
            child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
            const timer = setTimeout(() => {
                child.kill('SIGTERM');
            }, options.timeoutMs);
            child.on('close', code => {
                clearTimeout(timer);
                resolve({ stdout, stderr, exitCode: code ?? 1 });
            });
            child.on('error', err => {
                clearTimeout(timer);
                resolve({ stdout, stderr: err.message, exitCode: 1 });
            });
        });
    }
}

function truncate(text: string, max = 12_000): string {
    return text.length <= max ? text : `${text.slice(0, max)}\n…(truncated)`;
}
