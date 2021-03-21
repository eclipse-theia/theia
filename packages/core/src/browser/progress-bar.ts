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

import { LocationProgress, ProgressLocationService } from './progress-location-service';
import { DisposableCollection, Disposable } from '../common';
import { injectable, inject, postConstruct } from 'inversify';
import { ProgressBarOptions } from './progress-bar-factory';

@injectable()
export class ProgressBar implements Disposable {

    @inject(ProgressLocationService)
    protected readonly progressLocationService: ProgressLocationService;

    @inject(ProgressBarOptions)
    protected readonly options: ProgressBarOptions;

    protected readonly toDispose = new DisposableCollection();
    dispose(): void {
        this.toDispose.dispose();
    }

    protected progressBar: HTMLDivElement;
    protected progressBarContainer: HTMLDivElement;

    constructor() {
        this.progressBar = document.createElement('div');
        this.progressBar.className = 'theia-progress-bar';
        this.progressBar.style.display = 'none';
        this.progressBarContainer = document.createElement('div');
        this.progressBarContainer.className = 'theia-progress-bar-container';
        this.progressBarContainer.append(this.progressBar);
    }

    @postConstruct()
    protected init(): void {
        const { container, insertMode, locationId } = this.options;
        if (insertMode === 'prepend') {
            container.prepend(this.progressBarContainer);
        } else {
            container.append(this.progressBarContainer);
        }
        this.toDispose.push(Disposable.create(() => this.progressBarContainer.remove()));
        const onProgress = this.progressLocationService.onProgress(locationId);
        this.toDispose.push(onProgress(event => this.onProgress(event)));
        const current = this.progressLocationService.getProgress(locationId);
        if (current) {
            this.onProgress(current);
        }
    }

    protected onProgress(event: LocationProgress): void {
        if (this.toDispose.disposed) {
            return;
        }
        this.setVisible(event.show);
    }

    protected setVisible(visible: boolean): void {
        this.progressBar.style.display = visible ? 'block' : 'none';
    }

}
