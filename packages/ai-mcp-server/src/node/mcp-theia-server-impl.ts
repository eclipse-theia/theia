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

import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { generateUuid } from '@theia/core';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import * as express from '@theia/core/shared/express';
import { randomUUID } from 'crypto';
import { MCPTheiaServer } from './mcp-theia-server';
import { MCPBackendContributionManager } from './mcp-backend-contribution-manager';
import { MCPFrontendContributionManager } from './mcp-frontend-contribution-manager';

@injectable()
export class MCPTheiaServerImpl implements MCPTheiaServer, BackendApplicationContribution {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MCPBackendContributionManager)
    protected readonly backendContributionManager: MCPBackendContributionManager;

    @inject(MCPFrontendContributionManager)
    protected readonly frontendContributionManager: MCPFrontendContributionManager;

    protected server?: McpServer;
    protected httpTransports: Map<string, StreamableHTTPServerTransport> = new Map();
    protected httpApp?: express.Application;
    protected running = false;
    protected serverId: string = generateUuid();

    async configure?(app: express.Application): Promise<void> {
        this.httpApp = app;

        try {
            await this.start();
        } catch (error) {
            this.logger.error('Failed to start MCP server during initialization:', error);
        }
    }

    async start(): Promise<void> {
        if (this.running) {
            throw new Error('MCP server is already running');
        }

        this.server = new McpServer({
            name: 'Theia MCP Server',
            version: '1.0.0'
        }, {
            capabilities: {
                tools: {
                    listChanged: true
                },
                resources: {
                    listChanged: true
                },
                prompts: {
                    listChanged: true
                }
            }
        });

        await this.registerContributions();
        await this.setupHttpTransport();

        this.running = true;
    }

    async stop(): Promise<void> {
        if (!this.running) {
            return;
        }

        try {
            if (this.serverId) {
                await this.frontendContributionManager.unregisterFrontendContributions(this.serverId);
            }

            for (const transport of this.httpTransports.values()) {
                transport.close();
            }
            this.httpTransports.clear();

            if (this.server) {
                this.server.close();
                this.server = undefined;
            }

            this.running = false;
        } catch (error) {
            this.logger.error('Error stopping MCP server:', error);
            throw error;
        }
    }

    getServer(): McpServer | undefined {
        return this.server;
    }

    isRunning(): boolean {
        return this.running;
    }

    getServerId(): string | undefined {
        return this.serverId;
    }

    protected async setupHttpTransport(): Promise<void> {
        if (!this.server) {
            throw new Error('Server not initialized');
        }
        if (!this.httpApp) {
            throw new Error('AppServer not initialized');
        }

        this.setupHttpEndpoints(this.httpApp);
    }

    protected setupHttpEndpoints(app: express.Application): void {
        app.all('/mcp', async (req, res) => {
            await this.handleStreamableHttpRequest(req, res);
        });
    }

    protected async handleStreamableHttpRequest(req: express.Request, res: express.Response): Promise<void> {
        if (!this.server) {
            res.status(503).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'MCP Server not initialized',
                },
                id: undefined,
            });
            return;
        }

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        try {
            if (sessionId && this.httpTransports.has(sessionId)) {
                transport = this.httpTransports.get(sessionId)!;
            } else {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: newSessionId => {
                        this.httpTransports.set(newSessionId, transport);
                    }
                });

                transport.onclose = () => {
                    if (transport.sessionId) {
                        this.httpTransports.delete(transport.sessionId);
                    }
                };

                await this.server.connect(transport);
            }

            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            this.logger.error('Error handling MCP Streamable HTTP request:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: `Internal server error: ${error}`,
                    },
                    id: req.body?.id || undefined,
                });
            }
        }
    }

    protected async registerContributions(): Promise<void> {
        if (!this.server) {
            throw new Error('Server not initialized');
        }

        await this.backendContributionManager.registerBackendContributions(this.server);
        await this.registerFrontendContributions();
    }

    protected async registerFrontendContributions(): Promise<void> {
        if (!this.server) {
            throw new Error('Server not initialized');
        }

        try {
            await this.frontendContributionManager.setMCPServer(this.server, this.serverId);
        } catch (error) {
            this.logger.debug('Frontend contributions registration failed (this is normal if no frontend is connected):', error);
        }
    }

    onStop(): void {
        this.logger.debug('MCP Server stopping...');

        if (this.running) {
            try {
                if (this.serverId) {
                    this.frontendContributionManager.unregisterFrontendContributions(this.serverId)
                        .catch(error => this.logger.warn('Failed to unregister frontend contributions during shutdown:', error));
                }

                for (const transport of this.httpTransports.values()) {
                    transport.close();
                }
                this.httpTransports.clear();

                if (this.server) {
                    this.server.close();
                    this.server = undefined;
                }

                this.running = false;
            } catch (error) {
                this.logger.error('Error stopping MCP server:', error);
            }
        }
    }
}
