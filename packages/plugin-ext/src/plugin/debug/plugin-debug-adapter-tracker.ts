// *****************************************************************************
// Copyright (C) 2019 Red Hat, Inc. and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as theia from '@theia/plugin';

export class PluginDebugAdapterTracker implements theia.DebugAdapterTracker {
    constructor(protected readonly trackers: theia.DebugAdapterTracker[]) { }

    static async create(session: theia.DebugSession, trackerFactories: [string, theia.DebugAdapterTrackerFactory][]): Promise<PluginDebugAdapterTracker | undefined> {
        const trackers: theia.DebugAdapterTracker[] = [];

        const factories = trackerFactories.filter(tuple => tuple[0] === '*' || tuple[0] === session.type).map(tuple => tuple[1]);
        for (const factory of factories) {
            try {
                const tracker = await factory.createDebugAdapterTracker(session);
                if (tracker) {
                    trackers.push(tracker);
                }
            } catch (error) {
                console.error('Debug adapter tracker factory failed:', error);
            }
        }

        return trackers.length > 0 ? new PluginDebugAdapterTracker(trackers) : undefined;
    }

    onWillStartSession(): void {
        this.forEachTracker(tracker => tracker.onWillStartSession?.());
    }

    onWillReceiveMessage(message: any): void {
        this.forEachTracker(tracker => tracker.onWillReceiveMessage?.(message));
    }

    onDidSendMessage(message: any): void {
        this.forEachTracker(tracker => tracker.onDidSendMessage?.(message));
    }

    onWillStopSession(): void {
        this.forEachTracker(tracker => tracker.onWillStopSession?.());
    }

    onError(error: Error): void {
        this.forEachTracker(tracker => tracker.onError?.(error));
    }

    onExit(code: number | undefined, signal: string | undefined): void {
        this.forEachTracker(tracker => tracker.onExit?.(code, signal));
    }

    protected forEachTracker(callback: (tracker: theia.DebugAdapterTracker) => void): void {
        for (const tracker of this.trackers) {
            try {
                callback(tracker);
            } catch (error) {
                console.error('Debug adapter tracker failed:', error);
            }
        }
    }
}
