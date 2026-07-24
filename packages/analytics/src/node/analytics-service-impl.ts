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
import { ANALYTICS_ENABLED, ANALYTICS_ROUTES, AnalyticsPreferences } from '../common/analytics-preferences';
import { AnalyticsEvent, AnalyticsRpc, describeAnalyticsTopic, isValidAnalyticsEvent } from '../common/analytics-protocol';
import { AnalyticsData, AnalyticsService, snapshotAnalyticsData } from '../common/analytics-service';
import { isValidAnalyticsSinkId, isValidAnalyticsTopicPattern, matchesAnalyticsTopic } from '../common/analytics-topic';
import { AnalyticsSink } from './analytics-sink';

interface ValidatedAnalyticsSink {
    readonly sink: AnalyticsSink;
    readonly id: string;
    readonly interests: readonly string[];
}

@injectable()
export class AnalyticsServiceImpl implements AnalyticsService, AnalyticsRpc {

    protected sinks: readonly ValidatedAnalyticsSink[] | undefined;
    protected routes: ReadonlyMap<string, readonly string[]> | undefined;
    protected readinessFailureLogged = false;

    constructor(
        @inject(AnalyticsPreferences) protected readonly preferences: AnalyticsPreferences,
        @inject(ContributionProvider) @named(AnalyticsSink) protected readonly sinkProvider: ContributionProvider<AnalyticsSink>,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === ANALYTICS_ROUTES) {
                this.routes = undefined;
            }
        });
    }

    report<T extends object>(topic: string, data?: AnalyticsData<T>): void {
        this.dispatch({ topic, data, timestamp: Date.now() });
    }

    async reportEvent(event: AnalyticsEvent): Promise<void> {
        this.dispatch(event);
    }

    protected dispatch(event: AnalyticsEvent): void {
        if (!isValidAnalyticsEvent(event)) {
            this.logger.warn(`Ignoring malformed analytics event for topic '${describeAnalyticsTopic((event as Partial<AnalyticsEvent> | undefined)?.topic)}'.`);
            return;
        }
        const snapshot = Object.freeze({
            topic: event.topic,
            data: snapshotAnalyticsData(event.data),
            timestamp: event.timestamp
        });
        this.preferences.ready.then(
            () => this.doDispatch(snapshot),
            () => {
                if (!this.readinessFailureLogged) {
                    this.readinessFailureLogged = true;
                    this.logger.error('Analytics preferences failed to become ready; dropping analytics events.');
                }
            }
        );
    }

    protected doDispatch(event: AnalyticsEvent): void {
        if (!this.preferences[ANALYTICS_ENABLED]) {
            return;
        }

        const routes = this.getRoutes();
        for (const validatedSink of this.getSinks()) {
            const routePatterns = routes.get(validatedSink.id);
            if (!routePatterns?.some(pattern => matchesAnalyticsTopic(pattern, event.topic))
                || !validatedSink.interests.some(pattern => matchesAnalyticsTopic(pattern, event.topic))) {
                continue;
            }
            try {
                Promise.resolve(validatedSink.sink.handle(event)).catch(() => this.logSinkFailure(validatedSink.id, event.topic));
            } catch {
                this.logSinkFailure(validatedSink.id, event.topic);
            }
        }
    }

    protected getSinks(): readonly ValidatedAnalyticsSink[] {
        if (this.sinks) {
            return this.sinks;
        }
        const contributions = this.sinkProvider.getContributions();
        const idCounts = new Map<string, number>();
        for (const sink of contributions) {
            if (isValidAnalyticsSinkId(sink.id)) {
                idCounts.set(sink.id, (idCounts.get(sink.id) ?? 0) + 1);
            }
        }
        this.sinks = contributions.flatMap(sink => {
            const id = sink.id;
            const interests = sink.interests;
            if (!isValidAnalyticsSinkId(id)) {
                this.logger.error(`Ignoring analytics sink with invalid ID '${String(id)}'.`);
                return [];
            }
            if (idCounts.get(id) !== 1) {
                this.logger.error(`Ignoring duplicate analytics sink ID '${id}'.`);
                return [];
            }
            if (!Array.isArray(interests) || interests.length === 0
                || !interests.every(interest => isValidAnalyticsTopicPattern(interest))) {
                this.logger.error(`Ignoring analytics sink '${id}' with invalid interests.`);
                return [];
            }
            return [{ sink, id, interests: Object.freeze([...interests]) }];
        });
        return this.sinks;
    }

    protected getRoutes(): ReadonlyMap<string, readonly string[]> {
        if (this.routes) {
            return this.routes;
        }
        const routes = new Map<string, readonly string[]>();
        for (const [sinkId, patterns] of Object.entries(this.preferences[ANALYTICS_ROUTES])) {
            if (!Array.isArray(patterns)) {
                this.logger.warn(`Ignoring invalid analytics routes for sink '${sinkId}'.`);
                continue;
            }
            const validPatterns = patterns.filter(pattern => {
                if (isValidAnalyticsTopicPattern(pattern)) {
                    return true;
                }
                this.logger.warn(`Ignoring invalid analytics route pattern for sink '${sinkId}'.`);
                return false;
            });
            routes.set(sinkId, Object.freeze(validPatterns));
        }
        this.routes = routes;
        return routes;
    }

    protected logSinkFailure(sinkId: string, topic: string): void {
        this.logger.error(`Analytics sink '${sinkId}' failed while handling topic '${topic}'.`);
    }
}
