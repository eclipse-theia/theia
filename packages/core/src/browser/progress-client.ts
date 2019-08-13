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

import { injectable, inject } from 'inversify';
import { CancellationToken } from '../common/cancellation';
import { ProgressClient } from '../common/progress-service-protocol';
import { ProgressMessage, ProgressUpdate } from '../common/message-service-protocol';
import { ProgressStatusBarItem } from './progress-status-bar-item';
import { ProgressLocationService } from './progress-location-service';

@injectable()
export class DispatchingProgressClient implements ProgressClient {

    @inject(ProgressStatusBarItem)
    protected statusBarItem: ProgressStatusBarItem;

    @inject(ProgressLocationService)
    protected locationService: ProgressLocationService;

    showProgress(progressId: string, message: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        const locationId = this.getLocationId(message);
        if (locationId === 'window') {
            return this.statusBarItem.showProgress(progressId, message, cancellationToken);
        }
        return this.locationService.showProgress(progressId, message, cancellationToken);
    }

    reportProgress(progressId: string, update: ProgressUpdate, message: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        const locationId = this.getLocationId(message);
        if (locationId === 'window') {
            return this.statusBarItem.reportProgress(progressId, update, message, cancellationToken);
        }
        return this.locationService.reportProgress(progressId, update, message, cancellationToken);
    }

    protected getLocationId(message: ProgressMessage): string {
        return message.options && message.options.location || 'unknownLocation';
    }

}
