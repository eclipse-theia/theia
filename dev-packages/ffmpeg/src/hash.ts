// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import crypto = require('crypto');
import fs = require('fs-extra');

export async function hashFile(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const sha256 = crypto.createHash('sha256');
        fs.createReadStream(filePath)
            .on('close', () => resolve(sha256.digest()))
            .on('data', data => sha256.update(data))
            .on('error', reject);
    });
}
