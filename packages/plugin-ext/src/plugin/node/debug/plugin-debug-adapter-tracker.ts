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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as theia from '@theia/plugin';

export class PluginDebugAdapterTracker implements theia.DebugAdapterTracker {
    constructor(protected readonly trackers: theia.DebugAdapterTracker[]) { }

    static async create(session: theia.DebugSession, trackerFactories: [string, theia.DebugAdapterTrackerFactory][]): Promise<PluginDebugAdapterTracker> {
        const trackers: theia.DebugAdapterTracker[] = [];

        const factories = trackerFactories.filter(tuple => tuple[0] === '*' || tuple[0] === session.type).map(tuple => tuple[1]);
        for (const factory of factories) {
            const tracker = await factory.createDebugAdapterTracker(session);
            if (tracker) {
                trackers.push(tracker);
            }
        }

        return new PluginDebugAdapterTracker(trackers);
    }

    onWillStartSession(): void {
        this.trackers.forEach(tracker => {
            if (tracker.onWillStartSession) {
                tracker.onWillStartSession();
            }
        });
    }

    onWillReceiveMessage(message: any): void {
        this.trackers.forEach(tracker => {
            if (tracker.onWillReceiveMessage) {
                tracker.onWillReceiveMessage(message);
            }
        });
    }

    onDidSendMessage(message: any): void {
        this.trackers.forEach(tracker => {
            if (tracker.onDidSendMessage) {
                tracker.onDidSendMessage(message);
            }
        });
    }

    onWillStopSession(): void {
        this.trackers.forEach(tracker => {
            if (tracker.onWillStopSession) {
                tracker.onWillStopSession();
            }
        });
    }

    onError(error: Error): void {
        this.trackers.forEach(tracker => {
            if (tracker.onError) {
                tracker.onError(error);
            }
        });
    }

    onExit(code: number | undefined, signal: string | undefined): void {
        this.trackers.forEach(tracker => {
            if (tracker.onExit) {
                tracker.onExit(code, signal);
            }
        });
    }
}
