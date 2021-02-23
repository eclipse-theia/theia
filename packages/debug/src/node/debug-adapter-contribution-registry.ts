/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { ContributionProvider } from '@theia/core';
import { DebugConfiguration } from '../common/debug-configuration';
import { DebuggerDescription, DebugError } from '../common/debug-service';

import { DebugAdapterContribution, DebugAdapterExecutable, DebugAdapterSessionFactory } from '../common/debug-model';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';

/**
 * Contributions registry.
 */
@injectable()
export class DebugAdapterContributionRegistry {

    @inject(ContributionProvider) @named(DebugAdapterContribution)
    protected readonly contributions: ContributionProvider<DebugAdapterContribution>;
    protected *getContributions(debugType: string): IterableIterator<DebugAdapterContribution> {
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.type === debugType || contribution.type === '*' || debugType === '*') {
                yield contribution;
            }
        }
    }

    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    protected _debugTypes: string[] | undefined;
    debugTypes(): string[] {
        if (!this._debugTypes) {
            const result = new Set<string>();
            for (const contribution of this.contributions.getContributions()) {
                result.add(contribution.type);
            }
            this._debugTypes = [...result];
        }
        return this._debugTypes;
    }

    async getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]> {
        const debuggers: DebuggerDescription[] = [];
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.languages && contribution.label) {
                const label = await contribution.label;
                if (label && (await contribution.languages || []).indexOf(language) !== -1) {
                    debuggers.push({
                        type: contribution.type,
                        label
                    });
                }
            }
        }
        return debuggers;
    }

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    async provideDebugConfigurations(debugType: string, workspaceFolderUri?: string): Promise<DebugConfiguration[]> {
        const configurations: DebugConfiguration[] = [];
        for (const contribution of this.getContributions(debugType)) {
            if (contribution.provideDebugConfigurations) {
                try {
                    const result = await contribution.provideDebugConfigurations(workspaceFolderUri);
                    configurations.push(...result);
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return configurations;
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes before variable substitution.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri?: string): Promise<DebugConfiguration> {
        let current = config;
        for (const contribution of this.getContributions(config.type)) {
            if (contribution.resolveDebugConfiguration) {
                try {
                    const next = await contribution.resolveDebugConfiguration(config, workspaceFolderUri);
                    if (next) {
                        current = next;
                    } else {
                        return current;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return current;
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes with substituted variables.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    async resolveDebugConfigurationWithSubstitutedVariables(config: DebugConfiguration, workspaceFolderUri?: string): Promise<DebugConfiguration> {
        let current = config;
        for (const contribution of this.getContributions(config.type)) {
            if (contribution.resolveDebugConfigurationWithSubstitutedVariables) {
                try {
                    const next = await contribution.resolveDebugConfigurationWithSubstitutedVariables(config, workspaceFolderUri);
                    if (next) {
                        current = next;
                    } else {
                        return current;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return current;
    }

    /**
     * Provides schema attributes.
     * @param debugType The registered debug type
     * @returns Schema attributes for the given debug type
     */
    async getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        const schemas: IJSONSchema[] = [];
        for (const contribution of this.getContributions(debugType)) {
            if (contribution.getSchemaAttributes) {
                try {
                    schemas.push(...await contribution.getSchemaAttributes());
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return schemas;
    }
    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        const schemas: IJSONSchemaSnippet[] = [];
        for (const contribution of this.getContributions('*')) {
            if (contribution.getConfigurationSnippets) {
                try {
                    schemas.push(...await contribution.getConfigurationSnippets());
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return schemas;
    }

    /**
     * Provides a [debug adapter executable](#DebugAdapterExecutable)
     * based on [debug configuration](#DebugConfiguration) to launch a new debug adapter.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [debug adapter executable](#DebugAdapterExecutable).
     */
    async provideDebugAdapterExecutable(config: DebugConfiguration): Promise<DebugAdapterExecutable> {
        for (const contribution of this.getContributions(config.type)) {
            if (contribution.provideDebugAdapterExecutable) {
                const executable = await contribution.provideDebugAdapterExecutable(config);
                if (executable) {
                    return executable;
                }
            }
        }
        throw DebugError.NotFound(config.type);
    }

    /**
     * Returns a [debug adapter session factory](#DebugAdapterSessionFactory).
     * @param debugType The registered debug type
     * @returns An [debug adapter session factory](#DebugAdapterSessionFactory)
     */
    debugAdapterSessionFactory(debugType: string): DebugAdapterSessionFactory | undefined {
        for (const contribution of this.getContributions(debugType)) {
            if (contribution.debugAdapterSessionFactory) {
                return contribution.debugAdapterSessionFactory;
            }
        }
        return undefined;
    }
}
