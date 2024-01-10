// *****************************************************************************
// Copyright (C) 2023 Arduino SA and others.
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

import { rejects } from 'assert';
import { strictEqual } from 'assert/strict';
import { promises as fs } from 'fs';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { isENOENT } from '../../common/errors';

describe('errors', () => {
    describe('errno-exception', () => {
        it('should be ENOENT error', async () => {
            await rejects(fs.readFile(generateUuid()), reason => isENOENT(reason));
        });

        it('should not be ENOENT error (no code)', () => {
            strictEqual(isENOENT(new Error('I am not ENOENT')), false);
        });

        it('should not be ENOENT error (other code)', async () => {
            await rejects(fs.readdir(__filename), reason => !isENOENT(reason));
        });
    });
});
