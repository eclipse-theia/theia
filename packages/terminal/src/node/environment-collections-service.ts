/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { isWindows } from '@theia/core';
import * as tv from '../common/terminal-variables';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class VariableCollectionsService implements tv.VariableCollectionsService {

    mergedCollection: tv.MergedEnvironmentVariableCollection;

    protected collections = new Map<string, tv.EnvironmentVariableCollectionWithPersistence>();

    constructor() {
        this.updateMergedCollection();
    }

    async setCollection(collectionIdentifier: string, collection: tv.EnvironmentVariableCollectionWithPersistence): Promise<void> {
        this.collections.set(collectionIdentifier, collection);
        this.updateMergedCollection();
    }

    async deleteCollection(collectionIdentifier: string): Promise<void> {
        this.collections.delete(collectionIdentifier);
        this.updateMergedCollection();
    }

    protected updateMergedCollection(): void {
        // TODO: persist collections on update?
        this.mergedCollection = new MergedEnvironmentVariableCollectionImpl(this.collections);
    }
}

export class MergedEnvironmentVariableCollectionImpl implements tv.MergedEnvironmentVariableCollection {

    protected map: Map<string, tv.OwnedEnvironmentVariableMutator[]> = new Map();

    constructor(collections: Map<string, tv.EnvironmentVariableCollection>) {
        collections.forEach((collection, identifier) => {
            const it = collection.map.entries();
            let next = it.next();
            while (!next.done) {
                const variable = next.value[0];
                let entry = this.map.get(variable);
                if (!entry) {
                    entry = [];
                    this.map.set(variable, entry);
                }

                // If the first item in the entry is replace ignore any other entries as they would
                // just get replaced by this one.
                if (entry.length > 0 && entry[0].type === tv.EnvironmentVariableMutatorType.Replace) {
                    next = it.next();
                    continue;
                }

                // Mutators get applied in the reverse order than they are created
                const mutator = next.value[1];
                entry.unshift({
                    identifier,
                    value: mutator.value,
                    type: mutator.type
                });

                next = it.next();
            }
        });
    }

    applyToProcessEnvironment(env: Record<string, string | null>): void {
        let lowerToActualVariableNames: { [lowerKey: string]: string | undefined } | undefined;
        if (isWindows) {
            lowerToActualVariableNames = {};
            Object.keys(env).forEach(e => lowerToActualVariableNames![e.toLowerCase()] = e);
        }
        this.map.forEach((mutators, variable) => {
            const actualVariable = isWindows ? lowerToActualVariableNames![variable.toLowerCase()] || variable : variable;
            mutators.forEach(mutator => {
                switch (mutator.type) {
                    case tv.EnvironmentVariableMutatorType.Append:
                        env[actualVariable] = (env[actualVariable] || '') + mutator.value;
                        break;
                    case tv.EnvironmentVariableMutatorType.Prepend:
                        env[actualVariable] = mutator.value + (env[actualVariable] || '');
                        break;
                    case tv.EnvironmentVariableMutatorType.Replace:
                        env[actualVariable] = mutator.value;
                        break;
                }
            });
        });
    }
}
