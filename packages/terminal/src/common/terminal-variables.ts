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

export const VARIABLE_COLLECTIONS_PATH = '/services/variable-collections';

export const VariableCollectionsService = Symbol('VariableCollectionsService');
export interface VariableCollectionsService {

    readonly mergedCollection: MergedEnvironmentVariableCollection

    setCollection(collectionIdentifier: string, collection: EnvironmentVariableCollectionWithPersistence): Promise<void>

    deleteCollection(collectionIdentifier: string): Promise<void>
}

/**
 * An environment variable collection that results from merging several collections together.
 */
export interface MergedEnvironmentVariableCollection {

    /**
     * Applies this collection to a process environment.
     */
    applyToProcessEnvironment(env: Record<string, string | null>): void
}

export const VariableCollectionsServer = Symbol('VariableCollectionsServer');
export interface VariableCollectionsServer {

    setCollection(collectionIdentifier: string, persistent: boolean, collection: SerializableEnvironmentVariableCollection): Promise<void>

    deleteCollection(collectionIdentifier: string): Promise<void>
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.0/src/vs/workbench/contrib/terminal/common/environmentVariable.ts

export const ENVIRONMENT_VARIABLE_COLLECTIONS_KEY = 'terminal.integrated.environmentVariableCollections';

export enum EnvironmentVariableMutatorType {
    Replace = 1,
    Append = 2,
    Prepend = 3
}

export interface EnvironmentVariableMutator {
    readonly value: string;
    readonly type: EnvironmentVariableMutatorType;
}

export interface EnvironmentVariableCollection {
    readonly map: ReadonlyMap<string, EnvironmentVariableMutator>;
}

export interface EnvironmentVariableCollectionWithPersistence extends EnvironmentVariableCollection {
    readonly persistent: boolean;
}

export interface OwnedEnvironmentVariableMutator extends EnvironmentVariableMutator {
    readonly identifier: string;
}

export interface SerializableOwnedEnvironmentVariableCollection {
    identifier: string,
    collection: SerializableEnvironmentVariableCollection
}

export type SerializableEnvironmentVariableCollection = [string, EnvironmentVariableMutator][];
