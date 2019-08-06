/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { CancellationToken } from '../common/cancellation';
import { ProgressClient } from '../common/progress-service-protocol';
import { ProgressMessage, ProgressUpdate } from '../common/message-service-protocol';
import { Deferred } from '../common/promise-util';
import { Event, Emitter } from '../common/event';
import throttle = require('lodash.throttle');

export interface ProgressLocationEvent {
    message?: string;
    show: boolean;
}

@injectable()
export class ProgressLocationService implements ProgressClient {

    protected emitters = new Map<string, Emitter<ProgressLocationEvent>[]>();

    onProgress(locationId: string): Event<ProgressLocationEvent> {
        const emitter = this.addEmitter(locationId);
        return emitter.event;
    }
    protected addEmitter(locationId: string): Emitter<ProgressLocationEvent> {
        const emitter = new Emitter<ProgressLocationEvent>();
        const list = this.emitters.get(locationId) || [];
        list.push(emitter);
        this.emitters.set(locationId, list);
        return emitter;
    }

    protected readonly progressByLocation = new Map<string, Set<string>>();

    async showProgress(progressId: string, message: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        const locationId = this.getLocationId(message);
        const result = new Deferred<string | undefined>();
        cancellationToken.onCancellationRequested(() => {
            this.processEvent(progressId, locationId, 'done');
            result.resolve(ProgressMessage.Cancel);
        });
        this.processEvent(progressId, locationId, 'start');
        return result.promise;
    }
    protected processEvent(progressId: string, locationId: string, event: 'start' | 'done'): void {
        const progressSet = this.progressByLocation.get(locationId) || new Set<string>();
        if (event === 'start') {
            progressSet.add(progressId);
        } else {
            progressSet.delete(progressId);
        }
        this.progressByLocation.set(locationId, progressSet);
        const show = !!progressSet.size;
        this.fireEvent(locationId, show);
    }
    protected readonly fireEvent = throttle((locationId: string, show: boolean) => {
        let emitters = this.emitters.get(locationId);
        if (!emitters) {
            emitters = [ this.addEmitter(locationId) ];
        }
        emitters.forEach(e => e.fire({ show }));
    }, 250);

    protected getLocationId(message: ProgressMessage): string {
        return message.options && message.options.location || 'unknownLocation';
    }

    async reportProgress(progressId: string, update: ProgressUpdate, message: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        /* NOOP */
    }

}
