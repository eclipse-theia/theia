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

import { ProgressLocationEvent } from './progress-location-service';
import { DisposableCollection, Disposable } from '../common';
import { Event } from '../common/event';

export class ProgressBar implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    dispose(): void {
        this.toDispose.dispose();
    }

    protected progressBar: HTMLDivElement;

    constructor(protected options: ProgressBar.Options, onProgress: Event<ProgressLocationEvent>) {
        this.progressBar = document.createElement('div');
        this.progressBar.className = 'theia-progress-bar';
        this.progressBar.style.display = 'none';
        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'theia-progress-bar-container';
        progressBarContainer.append(this.progressBar);
        const { container, insertMode } = this.options;
        if (insertMode === 'prepend') {
            container.prepend(progressBarContainer);
        } else {
            container.append(progressBarContainer);
        }
        this.toDispose.pushAll([
            Disposable.create(() => progressBarContainer.remove()),
            onProgress(event => this.onProgress(event))
        ]);
    }

    protected onProgress(event: ProgressLocationEvent): void {
        if (this.toDispose.disposed) {
            return;
        }
        this.setVisible(event.show);
    }

    protected setVisible(visible: boolean): void {
        this.progressBar.style.display = visible ? 'block' : 'none';
    }

}
export namespace ProgressBar {
    export interface Options {
        container: HTMLElement;
        insertMode: 'append' | 'prepend';
    }
}
