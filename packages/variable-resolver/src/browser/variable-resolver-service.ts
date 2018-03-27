/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Variable, VariableRegistry } from './variable';

/**
 * The variable resolver service should be used to resolve variables in strings.
 */
@injectable()
export class VariableResolverService {

    protected static VAR_REGEXP = /\$\{(.*?)\}/g;

    constructor(
        @inject(VariableRegistry) protected readonly variableRegistry: VariableRegistry
    ) { }

    /**
	 * Resolve variables in the given string.
	 * @returns promise resolved to the provided string with already resolved variables.
     * Never reject.
	 */
    async resolve(text: string): Promise<string> {
        const variablesToValues = await this.resolveVariables(this.searchVariables(text));
        const resolvedText = text.replace(VariableResolverService.VAR_REGEXP, (match: string, varName: string) => {
            const value = variablesToValues.get(varName);
            return value ? value : match;
        });
        return resolvedText;
    }

    /**
     * Finds all variables in the given string.
     */
    protected searchVariables(text: string): Variable[] {
        const variables: Variable[] = [];
        let match;
        while ((match = VariableResolverService.VAR_REGEXP.exec(text)) !== null) {
            const variableName = match[1];
            const variable = this.variableRegistry.getVariable(variableName);
            if (variable) {
                variables.push(variable);
            }
        }
        return variables;
    }

    /**
     * Resolve the given variables.
     * @returns promise resolved to the map of the variable name to its value.
     * Never reject.
     */
    protected async resolveVariables(variables: Variable[]): Promise<Map<string, string>> {
        const resolvedVariables: Map<string, string> = new Map();
        const promises: Promise<any>[] = [];
        variables.forEach(variable => {
            const promise = Promise.resolve(variable.resolve()).then(value => {
                if (value) {
                    resolvedVariables.set(variable.name, value);
                }
            });
            promises.push(promise);
        });
        await Promise.all(promises);
        return resolvedVariables;
    }
}
