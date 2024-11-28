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

import * as assert from 'assert';
import { FileSystemWatcher } from './file-system-event-service-ext-impl';
import { DisposableCollection, Emitter } from '@theia/core';
import { FileSystemEvents } from '../common';
import { URI } from './types-impl';

const eventSource = new Emitter<FileSystemEvents>();
let disposables = new DisposableCollection();

function checkIgnore(ignoreCreate: number, ignoreChange: number, ignoreDelete: number): void {
    const watcher = new FileSystemWatcher(eventSource.event, '**/*.js', !ignoreCreate, !ignoreChange, !ignoreDelete);
    disposables.push(watcher);
    const matching = URI.file('/foo/bar/zoz.js');

    const changed: URI[] = [];
    const created: URI[] = [];
    const deleted: URI[] = [];
    watcher.onDidChange(e => {
        changed.push(e);
    });

    watcher.onDidCreate(e => {
        created.push(e);
    });

    watcher.onDidDelete(e => {
        deleted.push(e);
    });

    eventSource.fire({ changed: [matching], created: [matching], deleted: [matching] });

    assert.equal(created.length, ignoreCreate);
    assert.equal(deleted.length, ignoreDelete);
    assert.equal(changed.length, ignoreChange);

}

describe('File Watcher Test', () => {
    afterEach(() => {
        disposables.dispose();
        disposables = new DisposableCollection();
    });

    it('Should match files', () => {
        const watcher = new FileSystemWatcher(eventSource.event, '**/*.js');
        disposables.push(watcher);
        const matching = URI.file('/foo/bar/zoz.js');
        const notMatching = URI.file('/foo/bar/zoz.ts');
        const changed: URI[] = [];
        const created: URI[] = [];
        const deleted: URI[] = [];
        watcher.onDidChange(e => {
            changed.push(e);
        });

        watcher.onDidCreate(e => {
            created.push(e);
        });

        watcher.onDidDelete(e => {
            deleted.push(e);
        });

        const URIs = [matching, notMatching];
        eventSource.fire({ changed: URIs, created: URIs, deleted: URIs });
        assert.equal(matching.toString(), changed[0]?.toString());
        assert.equal(matching.toString(), created[0]?.toString());
        assert.equal(matching.toString(), deleted[0]?.toString());
    });

    it('Should ignore created', () => {
        checkIgnore(0, 1, 1);
    });

    it('Should ignore changed', () => {
        checkIgnore(1, 0, 1);
    });

    it('Should ignore deleted', () => {
        checkIgnore(1, 1, 0);
    });

    it('Should exclude files', () => {
        const watcher = new FileSystemWatcher(eventSource.event, '**/*.js', false, false, false, ['**/bar/**']);
        disposables.push(watcher);
        const notMatching = URI.file('/foo/bar/zoz.js');
        const matching = URI.file('/foo/gux/zoz.js');
        const changed: URI[] = [];
        const created: URI[] = [];
        const deleted: URI[] = [];
        watcher.onDidChange(e => {
            changed.push(e);
        });

        watcher.onDidCreate(e => {
            created.push(e);
        });

        watcher.onDidDelete(e => {
            deleted.push(e);
        });

        const URIs = [matching, notMatching];
        eventSource.fire({ changed: URIs, created: URIs, deleted: URIs });
        assert.equal(matching.toString(), changed[0]?.toString());
        assert.equal(matching.toString(), created[0]?.toString());
        assert.equal(matching.toString(), deleted[0]?.toString());
    });
});
