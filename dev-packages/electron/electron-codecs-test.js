#!/usr/bin/env node
// @ts-check
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
'use-strict'

const { libffmpegCodecs } = require('./electron-ffmpeg-lib');

const bad = [
    'h264',
    'aac',
];

async function main() {
    const codecs = await libffmpegCodecs();
    const found = [];
    for (const codec of codecs) {
        for (const name of bad) {
            if (codec.name === name) found.push(codec);
        }
    }
    if (found.length > 0) {
        throw new Error(found.map(codec => `\n> ${codec.name} detected (${codec.longName})`).join());
    }
}

main().catch(error => {
    console.error(error);
    process.exit(error.code || 127);
})
