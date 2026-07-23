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
// http://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContributionProvider, ILogger } from '@theia/core/lib/common';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ANALYTICS_ENABLED, ANALYTICS_ROUTES, AnalyticsPreferences } from '../common/analytics-preferences';
import { AnalyticsEvent, AnalyticsRpc } from '../common/analytics-protocol';
import { AnalyticsData, AnalyticsService, isAnalyticsData } from '../common/analytics-service';
import {
    isValidAnalyticsSinkId,
    isValidAnalyticsTopic,
    isValidAnalyticsTopicPattern,
    matchesAnalyticsTopic
} from '../common/analytics-topic';
import { AnalyticsSink } from './analytics-sink';

@injectable()
export class AnalyticsServiceImpl implements AnalyticsService, AnalyticsRpc {

    protected sinks: readonly AnalyticsSink[] | undefined;

    constructor(
        @inject(AnalyticsPreferences) protected readonly preferences: AnalyticsPreferences,
        @inject(ContributionProvider) @named(AnalyticsSink) protected readonly sinkProvider: ContributionProvider<AnalyticsSink>,
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    report<T extends object>(topic: string, data?: AnalyticsData<T>): void {
        this.dispatch({ topic, data, timestamp: Date.now() });
    }

    async reportEvent(event: AnalyticsEvent): Promise<void> {
        this.dispatch(event);
    }

    protected dispatch(event: AnalyticsEvent): void {
        if (!this.isValidEvent(event)) {
            this.logger.warn(`Ignoring malformed analytics event for topic '${this.describeTopic(event?.topic)}'.`);
            return;
        }
        void this.preferences.ready.then(() => this.doDispatch(event));
    }

    protected doDispatch(event: AnalyticsEvent): void {
        if (!this.preferences[ANALYTICS_ENABLED]) {
            return;
        }

        const routes = this.preferences[ANALYTICS_ROUTES];
        for (const sink of this.getSinks()) {
            const routePatterns = routes[sink.id];
            if (!Array.isArray(routePatterns) || routePatterns.length === 0) {
                continue;
            }
            const validRoutes = routePatterns.filter(pattern => this.validateRoutePattern(sink.id, pattern));
            if (!validRoutes.some(pattern => matchesAnalyticsTopic(pattern, event.topic))
                || !sink.interests.some(pattern => matchesAnalyticsTopic(pattern, event.topic))) {
                continue;
            }
            const envelope = Object.freeze({
                topic: event.topic,
                data: event.data,
                timestamp: event.timestamp
            });
            try {
                Promise.resolve(sink.handle(envelope)).catch(() => this.logSinkFailure(sink.id, event.topic));
            } catch {
                this.logSinkFailure(sink.id, event.topic);
            }
        }
    }

    protected getSinks(): readonly AnalyticsSink[] {
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
        this.sinks = contributions.filter(sink => {
            if (!isValidAnalyticsSinkId(sink.id)) {
                this.logger.error(`Ignoring analytics sink with invalid ID '${String(sink.id)}'.`);
                return false;
            }
            if (idCounts.get(sink.id) !== 1) {
                this.logger.error(`Ignoring duplicate analytics sink ID '${sink.id}'.`);
                return false;
            }
            if (!Array.isArray(sink.interests) || sink.interests.length === 0
                || !sink.interests.every(interest => isValidAnalyticsTopicPattern(interest))) {
                this.logger.error(`Ignoring analytics sink '${sink.id}' with invalid interests.`);
                return false;
            }
            return true;
        });
        return this.sinks;
    }

    protected isValidEvent(event: AnalyticsEvent): boolean {
        return typeof event === 'object'
            // eslint-disable-next-line no-null/no-null
            && event !== null
            && isValidAnalyticsTopic(event.topic)
            && typeof event.timestamp === 'number'
            && Number.isFinite(event.timestamp)
            && (event.data === undefined || isAnalyticsData(event.data));
    }

    protected validateRoutePattern(sinkId: string, pattern: unknown): pattern is string {
        if (isValidAnalyticsTopicPattern(pattern)) {
            return true;
        }
        this.logger.warn(`Ignoring invalid analytics route pattern for sink '${sinkId}'.`);
        return false;
    }

    protected describeTopic(topic: unknown): string {
        return typeof topic === 'string' ? topic : '<invalid>';
    }

    protected logSinkFailure(sinkId: string, topic: string): void {
        this.logger.error(`Analytics sink '${sinkId}' failed while handling topic '${topic}'.`);
    }
}
