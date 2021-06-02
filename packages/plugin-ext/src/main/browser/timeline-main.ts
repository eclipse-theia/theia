/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { interfaces } from '@theia/core/shared/inversify';
import { TimelineMain } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { TimelineService } from '@theia/timeline/lib/browser/timeline-service';
import { Emitter } from '@theia/core/lib/common';
import { URI } from '@theia/core/shared/vscode-uri';
import { MAIN_RPC_CONTEXT, TimelineExt } from '../../common/plugin-api-rpc';
import {
    InternalTimelineOptions,
    Timeline,
    TimelineOptions,
    TimelineProviderDescriptor,
    TimelineChangeEvent
} from '@theia/timeline/lib/common/timeline-model';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/afacd2bdfe7060f09df9b9139521718915949757/src/vs/workbench/api/browser/mainThreadTimeline.ts

export class TimelineMainImpl implements TimelineMain {
    private readonly proxy: TimelineExt;
    private readonly timelineService: TimelineService;
    private readonly providerEmitters = new Map<string, Emitter<TimelineChangeEvent>>();
    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TIMELINE_EXT);
        this.timelineService = container.get<TimelineService>(TimelineService);
    }

    async $registerTimelineProvider(provider: TimelineProviderDescriptor): Promise<void> {
        const proxy = this.proxy;

        const emitters = this.providerEmitters;
        let onDidChange = emitters.get(provider.id);
        if (onDidChange === undefined) {
            onDidChange = new Emitter<TimelineChangeEvent>();
            emitters.set(provider.id, onDidChange);
        }

        this.timelineService.registerTimelineProvider({
            ...provider,
            onDidChange: onDidChange.event,
            provideTimeline(uri: URI, options: TimelineOptions, internalOptions?: InternalTimelineOptions): Promise<Timeline | undefined> {
                return proxy.$getTimeline(provider.id, uri, options, internalOptions);
            },
            dispose(): void {
                emitters.delete(provider.id);
                if (onDidChange) {
                    onDidChange.dispose();
                }
            }
        });
    }

    async $unregisterTimelineProvider(id: string): Promise<void> {
        this.timelineService.unregisterTimelineProvider(id);
    }

    async $fireTimelineChanged(e: TimelineChangeEvent): Promise<void> {
        const emitter = this.providerEmitters.get(e.id);
        if (emitter) {
            emitter.fire(e);
        }
    }
}
