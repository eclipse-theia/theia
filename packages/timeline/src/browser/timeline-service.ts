/********************************************************************************
 * Copyright (C) 2020 RedHat and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Disposable, Emitter, Event } from '@theia/core/lib/common';
import { URI } from '@theia/core/shared/vscode-uri';
import {
    InternalTimelineOptions,
    Timeline,
    TimelineChangeEvent, TimelineItem, TimelineOptions,
    TimelineProvider,
    TimelineProvidersChangeEvent,
    TimelineSource
} from '../common/timeline-model';

@injectable()
export class TimelineService {
    private readonly providers = new Map<string, TimelineProvider>();

    private readonly onDidChangeProvidersEmitter = new Emitter<TimelineProvidersChangeEvent>();
    readonly onDidChangeProviders: Event<TimelineProvidersChangeEvent> = this.onDidChangeProvidersEmitter.event;

    private readonly onDidChangeTimelineEmitter = new Emitter<TimelineChangeEvent>();
    readonly onDidChangeTimeline: Event<TimelineChangeEvent> = this.onDidChangeTimelineEmitter.event;

    registerTimelineProvider(provider: TimelineProvider): Disposable {
        const id = provider.id;

        this.providers.set(id, provider);
        if (provider.onDidChange) {
            provider.onDidChange(e => this.onDidChangeTimelineEmitter.fire(e));
        }
        this.onDidChangeProvidersEmitter.fire({ added: [id] });

        return Disposable.create(() => this.unregisterTimelineProvider(id));
    }

    unregisterTimelineProvider(id: string): void {
        const provider = this.providers.get(id);
        if (provider) {
            provider.dispose();
            this.providers.delete(id);
            this.onDidChangeProvidersEmitter.fire({ removed: [id] });
        }
    }

    getSources(): TimelineSource[] {
        return [...this.providers.values()].map(p => ({ id: p.id, label: p.label }));
    }

    getSchemas(): string[] {
        const result: string[] = [];
        Array.from(this.providers.values()).forEach(provider => {
            const scheme = provider.scheme;
            if (typeof scheme === 'string') {
                result.push(scheme);
            } else {
                scheme.forEach(s => result.push(s));
            }
        });
        return result;
    }

    getTimeline(id: string, uri: URI, options: TimelineOptions, internalOptions?: InternalTimelineOptions): Promise<Timeline | undefined> {
        const provider = this.providers.get(id);
        if (!provider) {
            return Promise.resolve(undefined);
        }

        if (typeof provider.scheme === 'string') {
            if (provider.scheme !== '*' && provider.scheme !== uri.scheme) {
                return Promise.resolve(undefined);
            }
        }

        return provider.provideTimeline(uri, options, internalOptions)
            .then(result => {
                if (!result) {
                    return undefined;
                }
                result.items = result.items.map(item => ({ ...item, source: provider.id }));
                return result;
            });
    }
}

export class TimelineAggregate {
    readonly items: TimelineItem[];
    readonly source: string;
    readonly uri: string;

    private _cursor?: string;
    get cursor(): string | undefined {
        return this._cursor;
    }

    set cursor(cursor: string | undefined) {
        this._cursor = cursor;
    }

    constructor(timeline: Timeline) {
        this.source = timeline.source;
        this.items = timeline.items;
        this._cursor = timeline.paging?.cursor;
    }

    add(items: TimelineItem[]): void {
        this.items.push(...items);
        this.items.sort((a, b) => b.timestamp - a.timestamp);
    }
}
