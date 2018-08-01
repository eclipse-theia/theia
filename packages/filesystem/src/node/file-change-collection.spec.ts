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
import { FileChangeType } from '../common/filesystem-watcher-protocol';

describe('FileChangeCollection', () => {

    assertChanges({
        first: FileChangeType.ADDED,
        second: FileChangeType.ADDED,
        expected: FileChangeType.ADDED
    });

    assertChanges({
        first: FileChangeType.ADDED,
        second: FileChangeType.UPDATED,
        expected: FileChangeType.ADDED
    });

    assertChanges({
        first: FileChangeType.ADDED,
        second: FileChangeType.DELETED,
        expected: undefined
    });

    assertChanges({
        first: FileChangeType.UPDATED,
        second: FileChangeType.ADDED,
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        first: FileChangeType.UPDATED,
        second: FileChangeType.UPDATED,
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        first: FileChangeType.UPDATED,
        second: FileChangeType.DELETED,
        expected: FileChangeType.DELETED
    });

    assertChanges({
        first: FileChangeType.DELETED,
        second: FileChangeType.ADDED,
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        first: FileChangeType.DELETED,
        second: FileChangeType.UPDATED,
        expected: FileChangeType.UPDATED
    });

    assertChanges({
        first: FileChangeType.DELETED,
        second: FileChangeType.DELETED,
        expected: FileChangeType.DELETED
    });

    function assertChanges({ first, second, expected }: {
        first: FileChangeType,
        second: FileChangeType,
        expected: FileChangeType | undefined
    }): void {
        it(`${FileChangeType[first]} + ${FileChangeType[second]} => ${expected !== undefined ? FileChangeType[expected] : 'NONE'}`, () => {
            const collection = new FileChangeCollection();
            const uri = FileUri.create('/root/foo/bar.txt').toString();
            collection.push({
                uri,
                type: first
            });
            collection.push({
                uri,
                type: second
            });
            assert.deepEqual(expected !== undefined ? [{
                uri,
                type: expected
            }] : [], collection.values());
        });
    }

});
