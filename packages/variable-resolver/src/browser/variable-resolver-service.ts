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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable, inject } from '@theia/core/shared/inversify';
import { VariableRegistry } from './variable';
import URI from '@theia/core/lib/common/uri';
import { JSONExt, ReadonlyJSONValue } from '@theia/core/shared/@phosphor/coreutils';

export interface VariableResolveOptions {
    context?: URI;
    /**
     * Used for resolving inputs, see https://code.visualstudio.com/docs/editor/variables-reference#_input-variables
     */
    configurationSection?: string;
}

/**
 * The variable resolver service should be used to resolve variables in strings.
 */
@injectable()
export class VariableResolverService {

    protected static VAR_REGEXP = /\$\{(.*?)\}/g;

    @inject(VariableRegistry) protected readonly variableRegistry: VariableRegistry;

    /**
     * Resolve the variables in the given string array.
     * @param value The array of data to resolve
     * @param options options of the variable resolution
     * @returns promise resolved to the provided string array with already resolved variables.
     * Never reject.
     */
    resolveArray(value: string[], options: VariableResolveOptions = {}): Promise<string[]> {
        return this.resolve(value, options);
    }

    /**
     * Resolve the variables in the given string.
     * @param value Data to resolve
     * @param options options of the variable resolution
     * @returns promise resolved to the provided string with already resolved variables.
     * Never reject.
     */
    async resolve<T>(value: T, options: VariableResolveOptions = {}): Promise<T> {
        const context = new VariableResolverService.Context(this.variableRegistry, options);
        const resolved = await this.doResolve(value, context);
        return resolved as any;
    }

    protected async doResolve(value: Object | undefined, context: VariableResolverService.Context): Promise<Object | undefined> {
        // eslint-disable-next-line no-null/no-null
        if (value === undefined || value === null) {
            return value;
        }
        if (typeof value === 'string') {
            return this.doResolveString(value, context);
        }
        if (Array.isArray(value)) {
            return this.doResolveArray(value, context);
        }
        if (typeof value === 'object') {
            return this.doResolveObject(value, context);
        }
        return value;
    }

    protected async doResolveObject(obj: object, context: VariableResolverService.Context): Promise<object> {
        const result: {
            [prop: string]: Object | undefined
        } = {};
        for (const name of Object.keys(obj)) {
            const value = (obj as any)[name];
            const resolved = await this.doResolve(value, context);
            result[name] = resolved;
        }
        return result;
    }

    protected async doResolveArray(values: Array<Object | undefined>, context: VariableResolverService.Context): Promise<Array<Object | undefined>> {
        const result: (Object | undefined)[] = [];
        for (const value of values) {
            const resolved = await this.doResolve(value, context);
            result.push(resolved);
        }
        return result;
    }

    protected async doResolveString(value: string, context: VariableResolverService.Context): Promise<string> {
        await this.resolveVariables(value, context);
        return value.replace(VariableResolverService.VAR_REGEXP, (match: string, varName: string) => {
            const varValue = context.get(varName);
            return varValue !== undefined ? varValue : match;
        });
    }

    protected async resolveVariables(value: string, context: VariableResolverService.Context): Promise<void> {
        const variableRegExp = new RegExp(VariableResolverService.VAR_REGEXP);
        let match;
        // eslint-disable-next-line no-null/no-null
        while ((match = variableRegExp.exec(value)) !== null) {
            const variableName = match[1];
            await context.resolve(variableName);
        }
    }
}
export namespace VariableResolverService {
    export class Context {

        protected readonly resolved = new Map<string, string | undefined>();

        constructor(
            protected readonly variableRegistry: VariableRegistry,
            protected readonly options: VariableResolveOptions
        ) { }

        get(name: string): string | undefined {
            return this.resolved.get(name);
        }

        async resolve(name: string): Promise<void> {
            if (this.resolved.has(name)) {
                return;
            }
            try {
                let variableName = name;
                let argument: string | undefined;
                const parts = name.split(':');
                if (parts.length > 1) {
                    variableName = parts[0];
                    argument = parts[1];
                }
                const variable = this.variableRegistry.getVariable(variableName);
                const value = variable && await variable.resolve(this.options.context, argument, this.options.configurationSection);
                // eslint-disable-next-line no-null/no-null
                const stringValue = value !== undefined && value !== null && JSONExt.isPrimitive(value as ReadonlyJSONValue) ? String(value) : undefined;
                this.resolved.set(name, stringValue);
            } catch (e) {
                console.error(`Failed to resolved '${name}' variable`, e);
                this.resolved.set(name, undefined);
            }
        }

    }
}
