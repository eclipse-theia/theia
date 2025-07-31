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
import { type ToolProvider, type ToolRequest } from '@theia/ai-core';
import { isLocalMCPServerDescription, MCPServerManager } from '@theia/ai-mcp/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CLOSE_BROWSER_FUNCTION_ID, IS_BROWSER_RUNNING_FUNCTION_ID, LAUNCH_BROWSER_FUNCTION_ID, QUERY_DOM_FUNCTION_ID } from '../common/app-tester-chat-functions';
import { BrowserAutomation } from '../common/browser-automation-protocol';

@injectable()
export abstract class BrowserAutomationToolProvider implements ToolProvider {
    @inject(BrowserAutomation)
    protected readonly browser: BrowserAutomation;

    abstract getTool(): ToolRequest;
}

@injectable()
export class LaunchBrowserProvider extends BrowserAutomationToolProvider {
    static ID = LAUNCH_BROWSER_FUNCTION_ID;

    @inject(MCPServerManager)
    protected readonly mcpServerManager: MCPServerManager;

    getTool(): ToolRequest {
        return {
            id: LaunchBrowserProvider.ID,
            name: LaunchBrowserProvider.ID,
            description: 'Start the browser.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }, handler: async () => {
                try {

                    const mcp = await this.mcpServerManager.getServerDescription('playwright');
                    if (!mcp) {
                        throw new Error('No MCP Playwright instance with name playwright found');
                    }
                    if (!isLocalMCPServerDescription(mcp)) {
                        throw new Error('The MCP Playwright instance must run locally.');
                    }

                    const cdpEndpointIndex = mcp.args?.findIndex(p => p === '--cdp-endpoint');
                    if (!cdpEndpointIndex) {
                        throw new Error('No --cdp-endpoint was provided.');
                    }
                    const cdpEndpoint = mcp.args?.[cdpEndpointIndex + 1];
                    if (!cdpEndpoint) {
                        throw new Error('No --cdp-endpoint argument was provided.');
                    }

                    let remoteDebuggingPort = 9222;
                    try {
                        const uri = new URL(cdpEndpoint);
                        if (uri.port) {
                            remoteDebuggingPort = parseInt(uri.port, 10);
                        } else {
                            // Default ports if not specified
                            remoteDebuggingPort = uri.protocol === 'https:' ? 443 : 80;
                        }
                    } catch (error) {
                        throw new Error(`Invalid --cdp-endpoint format, URL expected: ${cdpEndpoint}`);
                    }

                    const result = await this.browser.launch(remoteDebuggingPort);
                    return result;
                } catch (ex) {
                    return (`Failed to starting the browser: ${ex.message}`);
                }
            }
        };
    }
}

@injectable()
export class CloseBrowserProvider extends BrowserAutomationToolProvider {
    static ID = CLOSE_BROWSER_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: CloseBrowserProvider.ID,
            name: CloseBrowserProvider.ID,
            description: 'Close the browser.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            },
            handler: async () => {
                try {
                    await this.browser.close();
                } catch (ex) {
                    return (`Failed to close browser: ${ex.message}`);
                }
            }
        };
    }
}

@injectable()
export class IsBrowserRunningProvider extends BrowserAutomationToolProvider {
    static ID = IS_BROWSER_RUNNING_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: IsBrowserRunningProvider.ID,
            name: IsBrowserRunningProvider.ID,
            description: 'Check if the browser is running.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            },
            handler: async () => {
                try {
                    const isRunning = await this.browser.isRunning();
                    return isRunning ? 'Browser is running.' : 'Browser is not running.';
                } catch (ex) {
                    return (`Failed to check if browser is running: ${ex.message}`);
                }
            }
        };
    }
}

@injectable()
export class QueryDomProvider extends BrowserAutomationToolProvider {
    static ID = QUERY_DOM_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: QueryDomProvider.ID,
            name: QueryDomProvider.ID,
            description: 'Query the DOM of the active page.',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: `The selector of the element to get the DOM of. The selector is a 
                        CSS selector that identifies the element. If not provided, the entire DOM will be returned.`
                    }
                },
                required: []
            },
            handler: async arg => {
                try {
                    const { selector } = JSON.parse(arg);
                    return await this.browser.queryDom(selector);
                } catch (ex) {
                    return (`Failed to get DOM: ${ex.message}`);
                }
            }
        };
    }
}
