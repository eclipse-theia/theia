// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { TELEMETRY_ENABLED, TELEMETRY_FILTERS, TelemetryPreferences } from '../common/telemetry-preferences';
import { TelemetryEvent, TelemetryRpc, describeTelemetryEventTopic, isValidTelemetryEvent } from '../common/telemetry-protocol';
import { TelemetryData, TelemetryService, snapshotTelemetryData } from '../common/telemetry-service';
import { isValidTelemetrySinkId, isValidTelemetryTopicPattern, matchesTelemetryTopic } from '../common/telemetry-topic';
import { TelemetrySink } from './telemetry-sink';

interface ValidatedTelemetrySink {
    readonly sink: TelemetrySink;
    readonly id: string;
    readonly interests: readonly string[];
}

@injectable()
export class TelemetryServiceImpl implements TelemetryService, TelemetryRpc {

    protected sinks: readonly ValidatedTelemetrySink[] | undefined;
    protected filters: ReadonlyMap<string, readonly string[]> | undefined;
    protected readinessFailureLogged = false;

    constructor(
        @inject(TelemetryPreferences) protected readonly preferences: TelemetryPreferences,
        @inject(ContributionProvider) @named(TelemetrySink) protected readonly sinkProvider: ContributionProvider<TelemetrySink>,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === TELEMETRY_FILTERS) {
                this.filters = undefined;
            }
        });
    }

    report<T extends object>(topic: string, data?: TelemetryData<T>): void {
        this.dispatch({ topic, data, timestamp: Date.now() });
    }

    async reportEvent(event: unknown): Promise<void> {
        this.dispatch(event);
    }

    protected dispatch(event: unknown): void {
        if (!isValidTelemetryEvent(event)) {
            this.logger.warn(`Ignoring malformed telemetry event for topic '${describeTelemetryEventTopic(event)}'.`);
            return;
        }
        const snapshot = Object.freeze({
            topic: event.topic,
            data: snapshotTelemetryData(event.data),
            timestamp: event.timestamp
        });
        this.preferences.ready.then(
            () => this.doDispatch(snapshot),
            () => {
                if (!this.readinessFailureLogged) {
                    this.readinessFailureLogged = true;
                    this.logger.error('Telemetry preferences failed to become ready; dropping telemetry events.');
                }
            }
        );
    }

    protected doDispatch(event: TelemetryEvent): void {
        if (!this.preferences[TELEMETRY_ENABLED]) {
            return;
        }

        const filters = this.getFilters();
        for (const validatedSink of this.getSinks()) {
            const filterPatterns = filters.get(validatedSink.id);
            if (!filterPatterns?.some(pattern => matchesTelemetryTopic(pattern, event.topic))
                || !validatedSink.interests.some(pattern => matchesTelemetryTopic(pattern, event.topic))) {
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
            return [{ sink, id, interests: Object.freeze([...interests]) }];
        });
        return this.sinks;
    }

    protected getFilters(): ReadonlyMap<string, readonly string[]> {
        if (this.filters) {
            return this.filters;
        }
        const filters = new Map<string, readonly string[]>();
        for (const [sinkId, patterns] of Object.entries(this.preferences[TELEMETRY_FILTERS])) {
            if (!Array.isArray(patterns)) {
                this.logger.warn(`Ignoring invalid telemetry filters for sink '${sinkId}'.`);
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
