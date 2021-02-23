/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { TreeSource, TreeElement } from '@theia/core/lib/browser/source-tree';
import { DebugThread } from '../model/debug-thread';
import { DebugViewModel } from './debug-view-model';
import debounce = require('p-debounce');

@injectable()
export class DebugStackFramesSource extends TreeSource {

    @inject(DebugViewModel)
    protected readonly model: DebugViewModel;

    constructor() {
        super({
            placeholder: 'Not paused'
        });
    }

    @postConstruct()
    protected init(): void {
        this.refresh();
        this.toDispose.push(this.model.onDidChange(() => this.refresh()));
    }

    protected readonly refresh = debounce(() => this.fireDidChange(), 100);

    *getElements(): IterableIterator<TreeElement> {
        const thread = this.model.currentThread;
        if (!thread) {
            return;
        }
        for (const frame of thread.frames) {
            yield frame;

        }
        if (thread.stoppedDetails) {
            const { framesErrorMessage, totalFrames } = thread.stoppedDetails;
            if (framesErrorMessage) {
                yield {
                    render: () => <span title={framesErrorMessage}>{framesErrorMessage}</span>
                };
            }
            if (totalFrames && totalFrames > thread.frameCount) {
                yield new LoadMoreStackFrames(thread);
            }
        }
    }
}

export class LoadMoreStackFrames implements TreeElement {

    constructor(
        readonly thread: DebugThread
    ) { }

    render(): React.ReactNode {
        return <span className='theia-load-more-frames'>Load More Stack Frames</span>;
    }

    async open(): Promise<void> {
        const frames = await this.thread.fetchFrames();
        if (frames[0]) {
            this.thread.currentFrame = frames[0];
        }
    }

}
