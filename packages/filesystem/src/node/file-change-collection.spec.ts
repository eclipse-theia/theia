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

import * as assert from 'assert';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { FileChangeCollection } from './file-change-collection';
import { FileChangeType } from '../common/files';

describe('FileChangeCollection', () => {

    assertChanges({
        changes: [FileChangeType.ADDED, FileChangeType.ADDED],
        expected: FileChangeType.ADDED
    });

    assertChanges({
        changes: [FileChangeType.ADDED, FileChangeType.UPDATED],
        expected: FileChangeType.ADDED
    });

    assertChanges({
        changes: [FileChangeType.ADDED, FileChangeType.DELETED],
        expected: [FileChangeType.ADDED, FileChangeType.DELETED]
    });

    assertChanges({
        changes: [FileChangeType.UPDATED, FileChangeType.ADDED],
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        changes: [FileChangeType.UPDATED, FileChangeType.UPDATED],
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        changes: [FileChangeType.UPDATED, FileChangeType.DELETED],
        expected: FileChangeType.DELETED
    });

    assertChanges({
        changes: [FileChangeType.DELETED, FileChangeType.ADDED],
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        changes: [FileChangeType.DELETED, FileChangeType.UPDATED],
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        changes: [FileChangeType.DELETED, FileChangeType.DELETED],
        expected: FileChangeType.DELETED
    });

    assertChanges({
        changes: [FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED],
        expected: [FileChangeType.ADDED, FileChangeType.DELETED]
    });

    assertChanges({
        changes: [FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED, FileChangeType.ADDED],
        expected: [FileChangeType.ADDED]
    });

    assertChanges({
        changes: [FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED, FileChangeType.UPDATED],
        expected: [FileChangeType.ADDED]
    });

    assertChanges({
        changes: [FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED, FileChangeType.DELETED],
        expected: [FileChangeType.ADDED, FileChangeType.DELETED]
    });

    function assertChanges({ changes, expected }: {
        changes: FileChangeType[],
        expected: FileChangeType[] | FileChangeType
    }): void {
        const expectedTypes = Array.isArray(expected) ? expected : [expected];
        const expectation = expectedTypes.map(type => typeAsString(type)).join(' + ');
        it(`${changes.map(type => typeAsString(type)).join(' + ')} => ${expectation}`, () => {
            const collection = new FileChangeCollection();
            const uri = FileUri.create('/root/foo/bar.txt').toString();
            for (const type of changes) {
                collection.push({ uri, type });
            }
            const actual = collection.values().map(({ type }) => typeAsString(type)).join(' + ');
            assert.strictEqual(expectation, actual);
        });
    }

    function typeAsString(type: FileChangeType): string {
        return type === FileChangeType.UPDATED ? 'UPDATED' : type === FileChangeType.ADDED ? 'ADDED' : 'DELETED';
    }

});
