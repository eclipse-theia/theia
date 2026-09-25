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

import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { DiscoveredModel } from '../../common/model-discovery-status';
import { ModelDiscoveryFetcherImpl } from '../model-discovery-fetcher';
import { ModelSnapshotStore } from '../model-snapshot-store';

/** Keeps what a discovery run writes in memory, so a test can seed and inspect the snapshot. */
export class InMemoryModelSnapshotStore implements ModelSnapshotStore {

    snapshot: DiscoveredModel[] | undefined;

    async read(): Promise<DiscoveredModel[] | undefined> {
        return this.snapshot;
    }

    async write(_fileName: string, models: DiscoveredModel[]): Promise<void> {
        this.snapshot = [...models];
    }
}

/**
 * The real fetcher against an in-memory snapshot store and without the waiting, so that a provider's
 * spec exercises the retry and fallback behaviour it actually runs with.
 */
export class TestModelDiscoveryFetcher extends ModelDiscoveryFetcherImpl {

    readonly store = new InMemoryModelSnapshotStore();

    get snapshot(): DiscoveredModel[] | undefined {
        return this.store.snapshot;
    }

    set snapshot(models: DiscoveredModel[] | undefined) {
        this.store.snapshot = models;
    }

    constructor() {
        super();
        const injected = this as unknown as { snapshotStore: ModelSnapshotStore; logger: MockLogger };
        injected.snapshotStore = this.store;
        injected.logger = new MockLogger();
    }

    protected override delay(): Promise<void> {
        return Promise.resolve();
    }
}
