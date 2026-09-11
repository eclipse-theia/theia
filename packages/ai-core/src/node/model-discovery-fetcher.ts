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

import { ILogger } from '@theia/core';
import { timeout } from '@theia/core/lib/common/promise-util';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { DiscoveredModel, ModelDiscoveryResult } from '../common/model-discovery-status';
import { ModelSnapshotStore } from './model-snapshot-store';

export const ModelDiscoveryFetcher = Symbol('ModelDiscoveryFetcher');

/** What a provider contributes to a discovery run; everything around it is the same for all of them. */
export interface ModelDiscoveryRequest {
    /** Name the provider's snapshot is kept under, e.g. `anthropic-models.json`. */
    readonly snapshotFile: string;
    /** The provider, for the log entry a failed fetch leaves, e.g. `Anthropic`. */
    readonly providerLabel: string;
    /** Asks the provider what it offers. Called again while {@link isRetryable} accepts the failure. */
    listModels(): Promise<DiscoveredModel[]>;
    /**
     * Whether a failure is transient enough to try again. Nothing is retried by default: a provider
     * knows which of its SDK's errors are a connection giving out and which are an answer.
     */
    isRetryable?(error: unknown): boolean;
}

/**
 * Runs a provider's model discovery: asks it what it offers, retries a transient failure, and keeps
 * the answer as a snapshot so the models survive a later failure or an offline start.
 */
export interface ModelDiscoveryFetcher {
    /**
     * Discovers the models of one provider. Returns the snapshot with `fromCache` set when the fetch
     * failed and there is one, and rejects with the fetch's own error when there is not.
     */
    fetch(request: ModelDiscoveryRequest): Promise<ModelDiscoveryResult>;
}

@injectable()
export class ModelDiscoveryFetcherImpl implements ModelDiscoveryFetcher {

    /** Number of attempts (including the first) for a discovery fetch on a retryable error. */
    protected maxAttempts = 3;
    /** Base linear backoff between attempts; multiplied by the number of the attempt that failed. */
    protected retryDelayMs = 500;

    @inject(ModelSnapshotStore)
    protected readonly snapshotStore: ModelSnapshotStore;

    @inject(ILogger) @named('ai-core:ModelDiscoveryFetcherImpl')
    protected readonly logger: ILogger;

    async fetch(request: ModelDiscoveryRequest): Promise<ModelDiscoveryResult> {
        try {
            const models = await this.listWithRetry(request);
            await this.snapshotStore.write(request.snapshotFile, models);
            return { models, fromCache: false };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const cached = await this.snapshotStore.read(request.snapshotFile);
            if (cached) {
                this.logger.warn(`${request.providerLabel}: model discovery failed (${message}); using cached snapshot.`);
                return { models: cached, fromCache: true, error: message };
            }
            throw error;
        }
    }

    /** Lists the models, retrying a transient failure with a linear backoff. */
    protected async listWithRetry(request: ModelDiscoveryRequest): Promise<DiscoveredModel[]> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            try {
                return await request.listModels();
            } catch (error) {
                lastError = error;
                if (attempt === this.maxAttempts || !request.isRetryable?.(error)) {
                    break;
                }
                await this.delay(this.retryDelayMs * attempt);
            }
        }
        throw lastError;
    }

    /** Waits between two attempts. Overridable so a test does not have to. */
    protected delay(ms: number): Promise<void> {
        return timeout(ms);
    }
}
