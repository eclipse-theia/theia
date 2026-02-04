// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Tool, Resource, Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { MCPFrontendContribution, ToolProvider } from '@theia/ai-mcp-server/lib/browser/mcp-frontend-contribution';
import { ILogger } from '@theia/core/lib/common/logger';

/**
 * Sample frontend MCP contribution that demonstrates accessing frontend-only services
 */
@injectable()
export class SampleFrontendMCPContribution implements MCPFrontendContribution {
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ILogger) @named('api-samples')
    protected readonly logger: ILogger;

    async getTools(): Promise<Tool[]> {
        return [
            {
                name: 'sample-workspace-info',
                description: 'Get information about the current workspace',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'sample-workspace-files',
                description: 'List files in the workspace',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: {
                            type: 'string',
                            description: 'Optional pattern to filter files'
                        }
                    },
                    required: []
                }
            }
        ];
    }

    async getTool(name: string): Promise<ToolProvider | undefined> {
        switch (name) {
            case 'sample-workspace-info':
                return {
                    handler: async args => {
                        try {
                            this.logger.debug('Getting workspace info with args:', args);
                            const roots = await this.workspaceService.roots;
                            return {
                                workspace: {
                                    roots: roots.map(r => r.resource.toString()),
                                    name: roots[0]?.name || 'Unknown'
                                }
                            };
                        } catch (error) {
                            this.logger.error('Error getting workspace info:', error);
                            throw error;
                        }
                    },
                    inputSchema: z.object({})
                };

            case 'sample-workspace-files':
                return {
                    handler: async args => {
                        try {
                            this.logger.debug('Listing workspace files with args:', args);
                            const typedArgs = args as { pattern?: string };

                            // Here we could use the FileService to collect all file information from the workspace
                            // const roots = await this.workspaceService.roots;
                            // const files: string[] = [];
                            // for (const root of roots) {
                            //     const rootUri = new URI(root.resource.toString());
                            //     const stat = await this.fileService.resolve(rootUri);
                            //     if (stat.children) {
                            //         for (const child of stat.children) {
                            //             files.push(child.resource.toString());
                            //         }
                            //     }
                            // }

                            // Return dummy content for demonstration purposes
                            const dummyFiles = [
                                'foo1.txt',
                                'foo2.txt',
                                'bar1.js',
                                'bar2.js',
                                'baz1.md',
                                'baz2.md',
                                'config.json',
                                'package.json',
                                'README.md'
                            ];

                            return {
                                files: typedArgs.pattern ? dummyFiles.filter(f => f.includes(typedArgs.pattern!)) : dummyFiles
                            };
                        } catch (error) {
                            this.logger.error('Error listing workspace files:', error);
                            throw error;
                        }
                    },
                    inputSchema: z.object({
                        pattern: z.string().optional()
                    })
                };

            default:
                return undefined;
        }
    }

    async getResources(): Promise<Resource[]> {
        return [
            {
                uri: 'sample-workspace://info',
                name: 'Sample Workspace Information',
                description: 'General information about the current workspace',
                mimeType: 'application/json'
            }
        ];
    }

    async readResource(uri: string): Promise<unknown> {
        if (uri === 'sample-workspace://info') {
            try {
                const roots = await this.workspaceService.roots;
                return {
                    workspace: {
                        roots: roots.map(r => ({
                            uri: r.resource.toString(),
                            name: r.name,
                            scheme: r.resource.scheme
                        })),
                        rootCount: roots.length
                    }
                };
            } catch (error) {
                this.logger.error('Error reading workspace resource:', error);
                throw error;
            }
        }
        throw new Error(`Unknown resource: ${uri}`);
    }

    async getPrompts(): Promise<Prompt[]> {
        return [
            {
                name: 'sample-workspace-context',
                description: 'Generate context information about the workspace',
                arguments: [
                    {
                        name: 'includeFiles',
                        description: 'Whether to include file listings',
                        required: false
                    }
                ]
            }
        ];
    }

    async getPrompt(name: string, args: unknown): Promise<PromptMessage[]> {
        if (name === 'sample-workspace-context') {
            try {
                const parsedArgs = args as { includeFiles?: boolean };
                const roots = await this.workspaceService.roots;

                let content = 'Current workspace information:\n\n';
                content += `Number of workspace roots: ${roots.length}\n`;

                for (const root of roots) {
                    content += `- Root: ${root.name} (${root.resource.toString()})\n`;
                }

                if (parsedArgs.includeFiles) {
                    content += '\nFile structure would be included here in a real implementation.';
                }

                return [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: content
                        }
                    }
                ];
            } catch (error) {
                this.logger.error('Error generating workspace context prompt:', error);
                throw error;
            }
        }
        throw new Error(`Unknown prompt: ${name}`);
    }
}
