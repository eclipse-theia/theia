// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { fetchQaapDeployEnv, runQaapDeploy } from './qaap-cloud-workspace-client';

export const QAAP_DEPLOY_VERCEL_TOOL_ID = 'qaap_deploy_vercel';
export const QAAP_DEPLOY_CLOUDFLARE_TOOL_ID = 'qaap_deploy_cloudflare';

@injectable()
export class QaapDeployVercelTool implements ToolProvider {

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: QAAP_DEPLOY_VERCEL_TOOL_ID,
            name: QAAP_DEPLOY_VERCEL_TOOL_ID,
            providerName: 'qaap',
            description: 'Deploy the current workspace to Vercel (production preview). Requires VERCEL_TOKEN in Qaap deploy env.',
            parameters: {
                type: 'object',
                properties: {
                    projectName: { type: 'string', description: 'Optional Vercel project name override' },
                },
            },
            handler: async (argString: string, ctx?: ToolInvocationContext): Promise<string> => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'cancelled' });
                }
                const args = JSON.parse(argString || '{}') as { projectName?: string };
                const root = (await this.workspace.roots)[0]?.resource.path.toString();
                if (!root) {
                    return JSON.stringify({ error: 'no workspace root' });
                }
                const env = await fetchQaapDeployEnv(this.workspaceKey());
                const hasToken = env.some(v => v.key === 'VERCEL_TOKEN' && v.value.trim());
                if (!hasToken) {
                    return JSON.stringify({
                        provider: 'vercel',
                        status: 'missing-env',
                        hint: 'Add VERCEL_TOKEN in the mobile Env panel (bootstrap → Env).',
                    });
                }
                const result = await runQaapDeploy({
                    provider: 'vercel',
                    workspaceKey: this.workspaceKey(),
                    workspaceRoot: root,
                    projectName: args.projectName,
                });
                return JSON.stringify(result ?? { error: 'deploy request failed' });
            },
        };
    }

    protected workspaceKey(): string {
        const uri = this.workspace.workspace?.resource?.toString();
        return uri ? `ws:${uri}` : 'default';
    }
}

@injectable()
export class QaapDeployCloudflareTool implements ToolProvider {

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    getTool(): ToolRequest {
        return {
            id: QAAP_DEPLOY_CLOUDFLARE_TOOL_ID,
            name: QAAP_DEPLOY_CLOUDFLARE_TOOL_ID,
            providerName: 'qaap',
            description: 'Deploy static or worker output to Cloudflare Pages. Requires CLOUDFLARE_API_TOKEN in Qaap deploy env.',
            parameters: {
                type: 'object',
                properties: {
                    projectName: { type: 'string', description: 'Cloudflare Pages project name' },
                },
            },
            handler: async (argString: string, ctx?: ToolInvocationContext): Promise<string> => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'cancelled' });
                }
                const args = JSON.parse(argString || '{}') as { projectName?: string };
                const root = (await this.workspace.roots)[0]?.resource.path.toString();
                if (!root) {
                    return JSON.stringify({ error: 'no workspace root' });
                }
                const env = await fetchQaapDeployEnv(this.workspaceKey());
                const hasToken = env.some(v => v.key === 'CLOUDFLARE_API_TOKEN' && v.value.trim());
                if (!hasToken) {
                    return JSON.stringify({
                        provider: 'cloudflare-pages',
                        status: 'missing-env',
                        hint: 'Add CLOUDFLARE_API_TOKEN in the mobile Env panel.',
                    });
                }
                const result = await runQaapDeploy({
                    provider: 'cloudflare-pages',
                    workspaceKey: this.workspaceKey(),
                    workspaceRoot: root,
                    projectName: args.projectName,
                });
                return JSON.stringify(result ?? { error: 'deploy request failed' });
            },
        };
    }

    protected workspaceKey(): string {
        const uri = this.workspace.workspace?.resource?.toString();
        return uri ? `ws:${uri}` : 'default';
    }
}
