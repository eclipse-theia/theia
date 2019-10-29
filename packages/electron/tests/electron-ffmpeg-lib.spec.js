/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

const path = require('path');
const { expect } = require('chai');

const { hashFile } = require('../electron-ffmpeg-lib');

function resource(...parts) {
    return path.resolve(__dirname, 'test-resources', ...parts);
}

describe('ffmpeg utility functions', () => {

    it('hashFile', async () => {
        const [
            hashA, hashB, hashC
        ] = await Promise.all([
            hashFile(resource('fileA.txt')),
            hashFile(resource('fileB.txt')),
            hashFile(resource('fileC.txt')),
        ]);
        expect(hashA.equals(hashC)).true;
        expect(hashA.equals(hashB)).false;
    });

});
