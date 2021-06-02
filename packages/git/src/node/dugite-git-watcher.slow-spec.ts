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

import * as fs from '@theia/core/shared/fs-extra';
import * as temp from 'temp';
import * as path from 'path';
import { expect } from 'chai';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { Git } from '../common/git';
import { DugiteGit } from './dugite-git';
import { Repository } from '../common';
import { initializeBindings } from './test/binding-helper';
import { DugiteGitWatcherServer } from './dugite-git-watcher';
import { bindGit, bindRepositoryWatcher } from './git-backend-module';
import { GitWatcherServer, GitStatusChangeEvent } from '../common/git-watcher';

/* eslint-disable no-unused-expressions */

const track = temp.track();

describe('git-watcher-slow', () => {

    let git: Git | undefined;
    let repository: Repository | undefined;
    let watcher: GitWatcherServer | undefined;

    beforeEach(async function (): Promise<void> {
        this.timeout(40000);

        const root = track.mkdirSync('git-watcher-slow');
        const localUri = FileUri.create(root).toString();
        const { container, bind } = initializeBindings();
        bindGit(bind);
        bindRepositoryWatcher(bind);

        git = container.get(DugiteGit);
        watcher = container.get(DugiteGitWatcherServer);
        repository = { localUri };

        await git!.clone('https://github.com/TypeFox/find-git-exec.git', { localUri });
    });

    after(function (): void {
        this.timeout(40000);
        track.cleanupSync();
    });

    it('watching the same repository multiple times should not duplicate the events', async function (): Promise<void> {
        this.timeout(40000);

        let ignoredEvents = 1;
        const events: GitStatusChangeEvent[] = [];
        const watchers: number[] = [];
        const client = {
            async onGitChanged(event: GitStatusChangeEvent): Promise<void> {
                // Ignore that event which is fired when one subscribes to the repository changes via #watchGitChanges(repository).
                if (ignoredEvents > 0) {
                    expect(event.status.changes).to.be.empty;
                    ignoredEvents--;
                    if (ignoredEvents === 0) {
                        // Once we consumed all the events we wanted to ignore, make the FS change.
                        await fs.createFile(path.join(FileUri.fsPath(repository!.localUri), 'A.txt'));
                        await sleep(6000);
                    }
                } else {
                    events.push(event);
                }
            }
        };
        watcher!.setClient(client);
        watchers.push(await watcher!.watchGitChanges(repository!));
        watchers.push(await watcher!.watchGitChanges(repository!));
        await sleep(6000);

        watchers.forEach(async watcherId => watcher!.unwatchGitChanges(watcherId));
        expect(events.length).to.be.equal(1, JSON.stringify(events));
        expect(events[0].status.changes.length).to.be.equal(1, JSON.stringify(events));
        expect(events[0].status.changes[0].uri.toString().endsWith('A.txt')).to.be.true;

        events.length = 0;
        // Revert the change we've made, and check for the notifications. Zero should be received.
        await fs.unlink(path.join(FileUri.fsPath(repository!.localUri), 'A.txt'));
        await sleep(6000);
        expect(events).to.be.empty;
    });

});

function sleep(time: number): Promise<unknown> {
    return new Promise(resolve => setTimeout(resolve, time));
}
