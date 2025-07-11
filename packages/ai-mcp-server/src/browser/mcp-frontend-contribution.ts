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

import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { Tool, Resource, Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';

export const MCPFrontendContribution = Symbol('MCPFrontendContribution');

/**
 * Tool provider interface for frontend contributions
 */
export interface ToolProvider {
    handler: (args: unknown) => Promise<unknown>;
    inputSchema: z.ZodSchema;
}

/**
 * Contribution interface for extending the MCP server with frontend-only tools, resources, and prompts
 */
export interface MCPFrontendContribution {
    /**
     * Get tools provided by this contribution
     */
    getTools?(): Promise<Tool[]> | Tool[];

    /**
     * Get specific tool by name
     */
    getTool?(name: string): Promise<ToolProvider | undefined> | ToolProvider | undefined;

    /**
     * Get resources provided by this contribution
     */
    getResources?(): Promise<Resource[]> | Resource[];

    /**
     * Read specific resource by URI
     */
    readResource?(uri: string): Promise<unknown> | unknown;

    /**
     * Get prompts provided by this contribution
     */
    getPrompts?(): Promise<Prompt[]> | Prompt[];

    /**
     * Get specific prompt by name with arguments
     */
    getPrompt?(name: string, args: unknown): Promise<PromptMessage[]> | PromptMessage[];
}

export const MCPFrontendContributionProvider = Symbol('MCPFrontendContributionProvider');
export interface MCPFrontendContributionProvider extends ContributionProvider<MCPFrontendContribution> { }
