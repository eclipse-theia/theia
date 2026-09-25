// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { promises as fs } from 'fs';
import * as path from 'path';
import { ILogger, isObject } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { DiscoveredModel } from '../common/model-discovery-status';

export const ModelSnapshotStore = Symbol('ModelSnapshotStore');

/** Directory below the configuration directory that holds the snapshots, one file per provider. */
export const MODEL_SNAPSHOT_DIRECTORY = 'model-snapshots';

/**
 * Persists what a provider's model discovery found, so the models stay available when a later
 * fetch fails or the application starts offline.
 */
export interface ModelSnapshotStore {
    /** Reads a provider's snapshot, or `undefined` when there is none (or it cannot be read). */
    read(fileName: string): Promise<DiscoveredModel[] | undefined>;
    /** Writes a provider's snapshot. Failures are logged, not thrown: a snapshot is a convenience. */
    write(fileName: string, models: DiscoveredModel[]): Promise<void>;
}

/** Stores one JSON file per provider in {@link MODEL_SNAPSHOT_DIRECTORY} below the configuration directory. */
@injectable()
export class ModelSnapshotStoreImpl implements ModelSnapshotStore {

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(ILogger) @named('ai-core:ModelSnapshotStoreImpl')
    protected readonly logger: ILogger;

    async read(fileName: string): Promise<DiscoveredModel[] | undefined> {
        try {
            const content = await fs.readFile(await this.snapshotPath(fileName), 'utf8');
            const models = (JSON.parse(content) as { models?: unknown }).models;
            return Array.isArray(models) ? models.filter(model => this.isDiscoveredModel(model)) : undefined;
        } catch {
            // A missing or unreadable snapshot is an expected state, not an error: discovery falls back to a live fetch.
            return undefined;
        }
    }

    async write(fileName: string, models: DiscoveredModel[]): Promise<void> {
        try {
            const file = await this.snapshotPath(fileName);
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, JSON.stringify({ models }, undefined, 2));
        } catch (error) {
            this.logger.warn(`Failed to persist the model snapshot '${fileName}':`, error instanceof Error ? error.message : error);
        }
    }

    protected isDiscoveredModel(candidate: unknown): candidate is DiscoveredModel {
        return isObject<DiscoveredModel>(candidate) && typeof candidate.id === 'string';
    }

    protected async snapshotPath(fileName: string): Promise<string> {
        const configDirUri = await this.envVariablesServer.getConfigDirUri();
        return new URI(configDirUri).resolve(MODEL_SNAPSHOT_DIRECTORY).resolve(fileName).path.fsPath();
    }
}
