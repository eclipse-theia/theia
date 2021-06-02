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

import { injectable } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, MaybePromise } from '@theia/core';
import URI from '@theia/core/lib/common/uri';

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
    resolve(context?: URI, argument?: string, configurationSection?: string): MaybePromise<Object | undefined>;
}

export const VariableContribution = Symbol('VariableContribution');
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

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Register the given variable.
     * Do nothing if a variable is already registered for the given variable name.
     */
    registerVariable(variable: Variable): Disposable {
        if (this.variables.has(variable.name)) {
            console.warn(`A variables with name ${variable.name} is already registered.`);
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

    /**
     * Register an array of variables.
     * Do nothing if a variable is already registered for the given variable name.
     */
    registerVariables(variables: Variable[]): Disposable[] {
        return variables.map(v => this.registerVariable(v));
    }
}
