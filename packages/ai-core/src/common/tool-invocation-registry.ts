// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { inject, injectable, named, postConstruct, interfaces } from '@theia/core/shared/inversify';
import { ToolRequest } from './language-model';
import { ContributionProvider } from '@theia/core';

export const ToolInvocationRegistry = Symbol('ToolInvocationRegistry');

/**
 * Registry for all the function calls available to Agents.
 */
export interface ToolInvocationRegistry {
    /**
     * Registers a tool into the registry.
     *
     * @param tool - The `ToolRequest` object representing the tool to be registered.
     */
    registerTool(tool: ToolRequest): void;

    /**
     * Retrieves a specific `ToolRequest` from the registry.
     *
     * @param toolId - The unique identifier of the tool to retrieve.
     * @returns The `ToolRequest` object corresponding to the provided tool ID,
     *          or `undefined` if the tool is not found in the registry.
     */
    getFunction(toolId: string): ToolRequest | undefined;

    /**
     * Retrieves multiple `ToolRequest`s from the registry.
     *
     * @param toolIds - A list of tool IDs to retrieve.
     * @returns An array of `ToolRequest` objects for the specified tool IDs.
     *          If a tool ID is not found, it is skipped in the returned array.
     */
    getFunctions(...toolIds: string[]): ToolRequest[];

    /**
     * Retrieves all `ToolRequest`s currently registered in the registry.
     *
     * @returns An array of all `ToolRequest` objects in the registry.
     */
    getAllFunctions(): ToolRequest[];

    /**
     * Unregisters all tools provided by a specific tool provider.
     *
     * @param providerName - The name of the tool provider whose tools should be removed (as specificed in the `ToolRequest`).
     */
    unregisterAllTools(providerName: string): void;
}

export const ToolProvider = Symbol('ToolProvider');
export interface ToolProvider {
    getTool(): ToolRequest;
}

/** Binds the identifier to self in singleton scope and then binds `ToolProvider` to that service. */
export function bindToolProvider(identifier: interfaces.Newable<ToolProvider>, bind: interfaces.Bind): void {
    bind(identifier).toSelf().inSingletonScope();
    bind(ToolProvider).toService(identifier);
}

@injectable()
export class ToolInvocationRegistryImpl implements ToolInvocationRegistry {

    private tools: Map<string, ToolRequest> = new Map<string, ToolRequest>();

    @inject(ContributionProvider)
    @named(ToolProvider)
    private providers: ContributionProvider<ToolProvider>;

    @postConstruct()
    init(): void {
        this.providers.getContributions().forEach(provider => {
            this.registerTool(provider.getTool());
        });
    }

    unregisterAllTools(providerName: string): void {
        const toolsToRemove: string[] = [];
        for (const [id, tool] of this.tools.entries()) {
            if (tool.providerName === providerName) {
                toolsToRemove.push(id);
            }
        }
        toolsToRemove.forEach(id => this.tools.delete(id));
    }
    getAllFunctions(): ToolRequest[] {
        return Array.from(this.tools.values());
    }

    registerTool(tool: ToolRequest): void {
        if (this.tools.has(tool.id)) {
            console.warn(`Function with id ${tool.id} is already registered.`);
        } else {
            this.tools.set(tool.id, tool);
        }
    }

    getFunction(toolId: string): ToolRequest | undefined {
        return this.tools.get(toolId);
    }

    getFunctions(...toolIds: string[]): ToolRequest[] {
        const tools: ToolRequest[] = toolIds.map(toolId => {
            const tool = this.tools.get(toolId);
            if (tool) {
                return tool;
            } else {
                throw new Error(`Function with id ${toolId} does not exist.`);
            }
        });
        return tools;
    }
}
