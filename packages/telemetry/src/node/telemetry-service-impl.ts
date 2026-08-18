// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { ContributionProvider, ILogger } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { TelemetryConsentProvider, isKindAllowedByLevel } from '../common/telemetry-consent-provider';
import { TELEMETRY_FILTERS, TelemetryPreferences } from '../common/telemetry-preferences';
import {
    TelemetryEvent, TelemetryRpc, createTelemetryEvent, describeTelemetryEventTopic, isValidTelemetryEvent, snapshotTelemetryEvent
} from '../common/telemetry-protocol';
import { TelemetryData, TelemetryReportOptions, TelemetryService } from '../common/telemetry-service';
import { isValidTelemetrySinkId, isValidTelemetryTopicPattern, matchesTelemetryTopic } from '../common/telemetry-topic';
import { BACKEND_TELEMETRY_SESSION } from '../common/telemetry-types';
import { TelemetrySink } from './telemetry-sink';

const MAX_PENDING_EVENTS = 1_000;

interface ValidatedTelemetrySink {
    readonly sink: TelemetrySink;
    readonly id: string;
    readonly interests: readonly string[];
    readonly scope: 'local' | 'remote';
}

@injectable()
export class TelemetryServiceImpl implements TelemetryService, TelemetryRpc, BackendApplicationContribution {

    protected sinks: readonly ValidatedTelemetrySink[] | undefined;
    protected filters: ReadonlyMap<string, readonly string[]> | undefined;
    protected readinessState: 'pending' | 'ready' | 'failed' = 'pending';
    protected pendingEvents: TelemetryEvent[] = [];
    protected pendingQueueOverflowWarned = false;

    @inject(TelemetryConsentProvider)
    protected readonly consentProvider: TelemetryConsentProvider;

    @inject(TelemetryPreferences)
    protected readonly preferences: TelemetryPreferences;

    @inject(ContributionProvider) @named(TelemetrySink)
    protected readonly sinkProvider: ContributionProvider<TelemetrySink>;

    @inject(ILogger) @named('telemetry:TelemetryServiceImpl')
    protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === TELEMETRY_FILTERS) {
                this.filters = undefined;
            }
        });
        this.preferences.ready.then(
            () => {
                this.readinessState = 'ready';
                const pendingEvents = this.pendingEvents;
                this.pendingEvents = [];
                this.pendingQueueOverflowWarned = false;
                pendingEvents.forEach(event => this.doDispatch(event));
            },
            () => {
                this.readinessState = 'failed';
                const pendingEvents = this.pendingEvents;
                this.pendingEvents = [];
                this.pendingQueueOverflowWarned = false;
                this.logger.error('Telemetry preferences failed to become ready; remote telemetry is disabled.');
                pendingEvents.forEach(event => this.doDispatch(event));
            }
        );
    }

    report<T extends object>(topic: string, data?: TelemetryData<T>, options?: TelemetryReportOptions): void {
        this.dispatch(createTelemetryEvent(topic, BACKEND_TELEMETRY_SESSION, data, options));
    }

    notifyEvent(event: unknown): void {
        this.dispatch(event, true);
    }

    async getLocalSinkInterests(): Promise<string[]> {
        return [...new Set(this.getSinks()
            .filter(sink => sink.scope === 'local')
            .flatMap(sink => sink.interests))];
    }

    async onStop(): Promise<void> {
        await Promise.all(this.getSinks().map(async validatedSink => {
            try {
                await validatedSink.sink.flush?.();
            } catch {
                this.logger.error(`Telemetry sink '${validatedSink.id}' failed while flushing.`);
            }
        }));
    }

    protected dispatch(event: unknown, rpcOrigin = false): void {
        if (!isValidTelemetryEvent(event)) {
            this.logger.warn(`Ignoring malformed telemetry event for topic '${describeTelemetryEventTopic(event)}'.`);
            return;
        }
        const snapshot = snapshotTelemetryEvent(rpcOrigin ? { ...event, session: `frontend/${event.session}` } : event);
        if (this.readinessState === 'ready' || this.readinessState === 'failed') {
            this.doDispatch(snapshot);
        } else if (this.readinessState === 'pending') {
            if (this.pendingEvents.length >= MAX_PENDING_EVENTS) {
                this.pendingEvents.shift();
                if (!this.pendingQueueOverflowWarned) {
                    this.pendingQueueOverflowWarned = true;
                    this.logger.warn('Telemetry pending event queue is full; dropping oldest event.');
                }
            }
            this.pendingEvents.push(snapshot);
        }
    }

    protected doDispatch(event: TelemetryEvent): void {
        const filters = this.getFilters();
        for (const validatedSink of this.getSinks()) {
            if (this.readinessState === 'failed' && validatedSink.scope === 'remote') {
                continue;
            }
            const filterPatterns = filters.get(validatedSink.id);
            if ((filterPatterns && !filterPatterns.some(pattern => matchesTelemetryTopic(pattern, event.topic)))
                || !validatedSink.interests.some(pattern => matchesTelemetryTopic(pattern, event.topic))
                || (validatedSink.scope === 'remote' && !isKindAllowedByLevel(this.consentProvider.level, event.kind))) {
                continue;
            }
            try {
                Promise.resolve(validatedSink.sink.handle(event)).catch(() => this.logSinkFailure(validatedSink.id, event.topic));
            } catch {
                this.logSinkFailure(validatedSink.id, event.topic);
            }
        }
    }

    protected getSinks(): readonly ValidatedTelemetrySink[] {
        if (this.sinks) {
            return this.sinks;
        }
        const contributions = this.sinkProvider.getContributions();
        const idCounts = new Map<string, number>();
        for (const sink of contributions) {
            if (isValidTelemetrySinkId(sink.id)) {
                idCounts.set(sink.id, (idCounts.get(sink.id) ?? 0) + 1);
            }
        }
        this.sinks = contributions.flatMap(sink => {
            const id = sink.id;
            const interests = sink.interests;
            if (!isValidTelemetrySinkId(id)) {
                this.logger.error(`Ignoring telemetry sink with invalid ID '${String(id)}'.`);
                return [];
            }
            if (idCounts.get(id) !== 1) {
                this.logger.error(`Ignoring duplicate telemetry sink ID '${id}'.`);
                return [];
            }
            if (!Array.isArray(interests) || interests.length === 0
                || !interests.every(interest => isValidTelemetryTopicPattern(interest))) {
                this.logger.error(`Ignoring telemetry sink '${id}' with invalid interests.`);
                return [];
            }
            const scope = sink.scope ?? 'remote';
            if (scope !== 'local' && scope !== 'remote') {
                this.logger.error(`Ignoring telemetry sink '${id}' with invalid scope.`);
                return [];
            }
            return [{ sink, id, interests: Object.freeze([...interests]), scope }];
        });
        return this.sinks;
    }

    protected getFilters(): ReadonlyMap<string, readonly string[]> {
        if (this.filters) {
            return this.filters;
        }
        const filters = new Map<string, readonly string[]>();
        for (const [sinkId, patterns] of Object.entries(this.preferences[TELEMETRY_FILTERS] ?? {})) {
            if (!Array.isArray(patterns)) {
                this.logger.warn(`Ignoring invalid telemetry filters for sink '${sinkId}'.`);
                filters.set(sinkId, Object.freeze([]));
                continue;
            }
            const validPatterns = patterns.filter(pattern => {
                if (isValidTelemetryTopicPattern(pattern)) {
                    return true;
                }
                this.logger.warn(`Ignoring invalid telemetry filter pattern for sink '${sinkId}'.`);
                return false;
            });
            filters.set(sinkId, Object.freeze(validPatterns));
        }
        this.filters = filters;
        return filters;
    }

    protected logSinkFailure(sinkId: string, topic: string): void {
        this.logger.error(`Telemetry sink '${sinkId}' failed while handling topic '${topic}'.`);
    }
}
