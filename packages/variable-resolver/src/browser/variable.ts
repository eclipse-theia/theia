/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { ILogger, Disposable, DisposableCollection, MaybePromise } from '@theia/core';

/**
 * Variable can be used inside of strings using ${variableName} syntax.
 */
export interface Variable {

    /**
     * A unique name of this variable.
     */
    readonly name: string;

    /**
     * A human-readable description of this variable.
     */
    readonly description?: string;

    /**
     * Resolve to a string value of this variable or
     * `undefined` if variable cannot be resolved.
     * Never reject.
     */
    resolve(): MaybePromise<string | undefined>;
}

export const VariableContribution = Symbol("VariableContribution");
/**
 * The variable contribution should be implemented to register custom variables.
 */
export interface VariableContribution {
    registerVariables(variables: VariableRegistry): void;
}

/**
 * The variable registry manages variables.
 */
@injectable()
export class VariableRegistry implements Disposable {

    protected readonly variables: Map<string, Variable> = new Map();
    protected readonly toDispose = new DisposableCollection();

    constructor(
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Register the given variable.
     * Do nothing if a variable is already registered for the given variable name.
     */
    registerVariable(variable: Variable): Disposable {
        if (this.variables.has(variable.name)) {
            this.logger.warn(`A variables with name ${variable.name} is already registered.`);
            return Disposable.NULL;
        }
        this.variables.set(variable.name, variable);
        const disposable = {
            dispose: () => this.variables.delete(variable.name)
        };
        this.toDispose.push(disposable);
        return disposable;
    }

    /**
     * Return all registered variables.
     */
    getVariables(): Variable[] {
        return [...this.variables.values()];
    }

    /**
     * Get a variable for the given name or `undefined` if none.
     */
    getVariable(name: string): Variable | undefined {
        return this.variables.get(name);
    }
}
