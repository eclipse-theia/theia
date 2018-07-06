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

import { injectable } from 'inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { ProgressReport } from './progress-protocol';

@injectable()
export class ProgressService {

    protected readonly onContributionChangedEmitter = new Emitter<ProgressReport>();
    public onContributionChanged: Event<ProgressReport> = this.onContributionChangedEmitter.event;

    private progressItemMap: Map<string, ProgressReport> = new Map();

    addOrUpdateContribution(progressContribution: ProgressReport): void {
        this.updateOrAddProgress(progressContribution);
        this.onContributionChangedEmitter.fire(progressContribution);
    }

    private updateOrAddProgress(progress: ProgressReport): void {
        const currProgressItem = this.progressItemMap.get(progress.id);
        if (currProgressItem && progress.complete) {
            this.progressItemMap.delete(progress.id);
            return;
        }

        if (progress.complete) {
            return;
        }

        this.progressItemMap.set(progress.id, progress);
    }

    get progressItems(): Array<ProgressReport> {
        return Array.from(this.progressItemMap.values());
    }

}
