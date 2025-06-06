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

import { Tool, Resource, ResourceContents, Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types';

/**
 * Client interface for MCP tool operations.
 * This interface is implemented by the frontend and called by the backend.
 */
export const MCPToolDelegateClient = Symbol('MCPToolDelegateClient');
export interface MCPToolDelegateClient {
    callTool(serverId: string, toolName: string, args: unknown): Promise<unknown>;
    listTools(serverId: string): Promise<Tool[]>;
    listResources(serverId: string): Promise<Resource[]>;
    readResource(serverId: string, uri: string): Promise<ResourceContents>;
    listPrompts(serverId: string): Promise<Prompt[]>;
    getPrompt(serverId: string, name: string, args: unknown): Promise<PromptMessage[]>;
}

/**
 * Backend delegate interface for MCP tool operations.
 * This interface extends MCPToolDelegateClient with RPC client setup capability.
 * It is implemented by the backend and acts as a proxy to forward calls to the frontend.
 */
export const MCPToolFrontendDelegate = Symbol('MCPToolFrontendDelegate');
export interface MCPToolFrontendDelegate extends MCPToolDelegateClient {
    setClient(client: MCPToolDelegateClient): void;
}

export const mcpToolDelegatePath = '/services/mcpToolDelegate';
