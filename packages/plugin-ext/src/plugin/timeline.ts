/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { Plugin, TimelineCommandArg, TimelineExt, TimelineMain } from '../common';
import { RPCProtocol } from '../common/rpc-protocol';
import { Disposable } from './types-impl';
import { PLUGIN_RPC_CONTEXT } from '../common';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandRegistryImpl } from './command-registry';
import type {
    InternalTimelineOptions,
    Timeline,
    TimelineItem,
    TimelineOptions,
    TimelineProvider
} from '@theia/timeline/lib/common/timeline-model';
import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { UriComponents } from '../common/uri-components';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/theia/blob/afacd2bdfe7060f09df9b9139521718915949757/src/vs/workbench/api/common/extHostTimeline.ts

export class TimelineExtImpl implements TimelineExt {
    declare readonly _serviceBrand: undefined;

    private readonly proxy: TimelineMain;
    private providers = new Map<string, TimelineProvider>();

    private itemsBySourceAndUriMap = new Map<string, Map<string | undefined, Map<string, theia.TimelineItem>>>();

    constructor(readonly rpc: RPCProtocol, private readonly commands: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TIMELINE_MAIN);

        commands.registerArgumentProcessor({
            processArgument: arg => {
                if (!TimelineCommandArg.is(arg)) {
                    return arg;
                } else {
                    return this.itemsBySourceAndUriMap.get(arg.source)?.get(arg.uri?.toString())?.get(arg.timelineHandle);
                }
            }
        });
    }

    async $getTimeline(id: string, uri: UriComponents, options: theia.TimelineOptions, internalOptions?: InternalTimelineOptions): Promise<Timeline | undefined> {
        const provider = this.providers.get(id);
        return provider?.provideTimeline(URI.revive(uri), options, internalOptions);
    }

    registerTimelineProvider(plugin: Plugin, scheme: string | string[], provider: theia.TimelineProvider): Disposable {
        const timelineDisposables = new DisposableCollection();

        const convertTimelineItem = this.convertTimelineItem(provider.id, timelineDisposables).bind(this);

        let disposable: Disposable | undefined;
        if (provider.onDidChange) {
            disposable = Disposable.from(provider.onDidChange(e => this.proxy.$fireTimelineChanged({ uri: undefined, reset: true, ...e, id: provider.id }), this));
        }

        const itemsBySourceAndUriMap = this.itemsBySourceAndUriMap;
        return this.registerTimelineProviderCore({
            ...provider,
            scheme: scheme,
            onDidChange: undefined,
            async provideTimeline(uri: URI, options: TimelineOptions, internalOptions?: InternalTimelineOptions): Promise<Timeline | undefined> {
                if (internalOptions?.resetCache) {
                    timelineDisposables.dispose();

                    const items = itemsBySourceAndUriMap.get(provider.id);
                    if (items) {
                        items.clear();
                    }
                }

                const result = await provider.provideTimeline(uri, options, CancellationToken.None);
                if (!result) {
                    return undefined;
                }

                const convertItem = convertTimelineItem(uri, internalOptions);
                return {
                    ...result,
                    source: provider.id,
                    items: result.items.map(convertItem)
                };
            },
            dispose(): void {
                for (const sourceMap of itemsBySourceAndUriMap.values()) {
                    const source = sourceMap.get(provider.id);
                    if (source) {
                        source.clear();
                    }
                }

                if (disposable) {
                    disposable.dispose();
                }
                timelineDisposables.dispose();
            }
        });
    }

    private convertTimelineItem(source: string, disposables: DisposableCollection): (uri: URI, options?: InternalTimelineOptions) => (item: theia.TimelineItem) => TimelineItem {
        return (uri: URI, options?: InternalTimelineOptions) => {
            let items: Map<string, theia.TimelineItem> | undefined;
            if (options?.cacheResults) {
                let itemsByUri = this.itemsBySourceAndUriMap.get(source);
                if (itemsByUri === undefined) {
                    itemsByUri = new Map();
                    this.itemsBySourceAndUriMap.set(source, itemsByUri);
                }

                const uriKey = getUriKey(uri);
                items = itemsByUri.get(uriKey);
                if (items === undefined) {
                    items = new Map();
                    itemsByUri.set(uriKey, items);
                }
            }

            return (item: theia.TimelineItem): TimelineItem => {
                const { iconPath, ...props } = item;

                const handle = `${source}|${item.id ?? item.timestamp}`;
                if (items) {
                    items.set(handle, item);
                }

                return {
                    ...props,
                    uri: uri.toString(),
                    id: props.id ?? undefined,
                    handle: handle,
                    source: source,
                    command: item.command ? this.commands.converter.toSafeCommand(item.command, disposables) : undefined,
                };
            };
        };
    }

    private registerTimelineProviderCore(provider: TimelineProvider): Disposable {
        const existing = this.providers.get(provider.id);
        if (existing) {
            throw new Error(`Timeline Provider ${provider.id} already exists.`);
        }

        this.proxy.$registerTimelineProvider({
            id: provider.id,
            label: provider.label,
            scheme: provider.scheme
        });
        this.providers.set(provider.id, provider);

        return Disposable.create(() => {
            for (const sourceMap of this.itemsBySourceAndUriMap.values()) {
                const items = sourceMap.get(provider.id);
                if (items) {
                    items.clear();
                }
            }

            this.providers.delete(provider.id);
            this.proxy.$unregisterTimelineProvider(provider.id);
            provider.dispose();
        });
    }
}

function getUriKey(uri: URI | undefined): string | undefined {
    return uri?.toString();
}
