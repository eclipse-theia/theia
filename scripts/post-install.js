#!/usr/bin/env node
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
'use-strict';

// @ts-check

const fs = require('fs');
const path = require('path');

async function main() {
    const electronCodecTestLogPath = path.resolve('dev-packages/electron/post-install.log');
    if (fs.existsSync(electronCodecTestLogPath)) {
        console.log('@theia/electron last logs:');
        console.log(fs.readFileSync(electronCodecTestLogPath, { encoding: 'utf8' }).trimRight());
    } else if (!process.env.THEIA_ELECTRON_SKIP_REPLACE_FFMPEG) {
        console.error('Cannot find the log file for the Electron codecs test.');
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
