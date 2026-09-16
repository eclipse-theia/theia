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

import { Emitter, Event } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { ModelDiscoveryStatus } from '../common/model-discovery-status';

/**
 * A provider that participates in dynamic model discovery. Provider frontend contributions
 * register a descriptor so the UI can display their {@link ModelDiscoveryStatus} and trigger
 * a manual refresh.
 */
export interface ModelDiscoveryProviderDescriptor {
    readonly providerId: string;
    readonly label: string;
    /** Prefix of this provider's registered model ids, if it differs from {@link providerId}. */
    readonly modelIdPrefix?: string;
    /** Triggers a manual re-fetch (used by the "Refresh"/"Retry" action). */
    refresh(): Promise<void>;
}

/**
 * Frontend registry of provider-level model-discovery status.
 *
 * Provider frontend contributions push their state here as they fetch models; the AI
 * configuration UI observes {@link onDidChange} to render fetching/error/no-credentials state.
 * This is the provider-level counterpart to the per-model `LanguageModelStatus`.
 */
@injectable()
export class ModelDiscoveryStatusService {

    protected readonly descriptors = new Map<string, ModelDiscoveryProviderDescriptor>();
    protected readonly statuses = new Map<string, ModelDiscoveryStatus>();

    protected readonly onDidChangeEmitter = new Emitter<ModelDiscoveryStatus>();
    /** Fired whenever a provider's status changes; the argument is the new status. */
    readonly onDidChange: Event<ModelDiscoveryStatus> = this.onDidChangeEmitter.event;

    /**
     * Register a provider. Idempotent: re-registering keeps any existing status and only
     * updates the refresh callback and label.
     */
    registerProvider(descriptor: ModelDiscoveryProviderDescriptor): void {
        this.descriptors.set(descriptor.providerId, descriptor);
        if (!this.statuses.has(descriptor.providerId)) {
            this.statuses.set(descriptor.providerId, {
                providerId: descriptor.providerId,
                label: descriptor.label,
                modelIdPrefix: descriptor.modelIdPrefix,
                state: 'idle'
            });
        }
        this.onDidChangeEmitter.fire(this.statuses.get(descriptor.providerId)!);
    }

    /**
     * Update a provider's status. Only the provided fields are changed; the rest are carried
     * over from the previous status. Passing `undefined` for an optional field explicitly clears it.
     */
    updateStatus(providerId: string, update: Partial<Omit<ModelDiscoveryStatus, 'providerId'>>): void {
        const previous = this.statuses.get(providerId);
        const next: ModelDiscoveryStatus = {
            providerId,
            label: update.label ?? previous?.label ?? providerId,
            modelIdPrefix: 'modelIdPrefix' in update ? update.modelIdPrefix : previous?.modelIdPrefix,
            state: update.state ?? previous?.state ?? 'idle',
            stateLabel: 'stateLabel' in update ? update.stateLabel : previous?.stateLabel,
            message: 'message' in update ? update.message : previous?.message,
            lastFetch: 'lastFetch' in update ? update.lastFetch : previous?.lastFetch,
            fromCache: 'fromCache' in update ? update.fromCache : previous?.fromCache,
            discovered: 'discovered' in update ? update.discovered : previous?.discovered,
            action: 'action' in update ? update.action : previous?.action
        };
        this.statuses.set(providerId, next);
        this.onDidChangeEmitter.fire(next);
    }

    /**
     * Reports a failed discovery run. Any step of a run can fail, including the ones that only talk to
     * the backend, and nothing awaits the promise a rejection would travel on: a provider's startup
     * does not, and a refresh button cannot act on it. What the previous state offered is cleared, so
     * a failure does not keep reading like the state before it (a badge, a sign-in button).
     */
    reportError(providerId: string, error: unknown): void {
        this.updateStatus(providerId, {
            state: 'error',
            stateLabel: undefined,
            message: error instanceof Error ? error.message : String(error),
            action: undefined
        });
    }

    getStatus(providerId: string): ModelDiscoveryStatus | undefined {
        return this.statuses.get(providerId);
    }

    getStatuses(): ModelDiscoveryStatus[] {
        return [...this.statuses.values()];
    }

    /** Trigger a manual refresh for the given provider, if it is registered. */
    async refresh(providerId: string): Promise<void> {
        await this.descriptors.get(providerId)?.refresh();
    }
}
