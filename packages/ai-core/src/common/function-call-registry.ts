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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ToolRequest } from './language-model';
import { ContributionProvider } from '@theia/core';

export const FunctionCallRegistry = Symbol('FunctionCallRegistry');

/**
 * Registry for all the function calls available to Agents.
 */
export interface FunctionCallRegistry {
    registerFunction(tool: ToolRequest<object>): void;

    getFunctions(...toolIds: string[]): ToolRequest<object>[];
}

export const ToolProvider = Symbol('ToolProvider');
export interface ToolProvider {
    getTool(): ToolRequest<object>;
}

@injectable()
export class FunctionCallRegistryImpl implements FunctionCallRegistry {

    private functions: Map<string, ToolRequest<object>> = new Map<string, ToolRequest<object>>();

    @inject(ContributionProvider)
    @named(ToolProvider)
    private providers: ContributionProvider<ToolProvider>;

    @postConstruct()
    init(): void {
        this.providers.getContributions().forEach(provider => {
            this.registerFunction(provider.getTool());
        });
    }

    registerFunction(tool: ToolRequest<object>): void {
        if (this.functions.has(tool.id)) {
            console.warn(`Function with id ${tool.id} is already registered.`);
        } else {
            this.functions.set(tool.id, tool);
        }
    }

    getFunctions(...toolIds: string[]): ToolRequest<object>[] {
        const tools: ToolRequest<object>[] = toolIds.map(toolId => {
            const tool = this.functions.get(toolId);
            if (tool) {
                return tool;
            } else {
                throw new Error(`Function with id ${toolId} does not exist.`);
            }
        });
        return tools;
    }
}

