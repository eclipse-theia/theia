// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

import * as ffmpeg from './ffmpeg';

export interface CheckFfmpegOptions extends ffmpeg.FfmpegOptions {
    json?: boolean
}

export interface CheckFfmpegResult {
    free: ffmpeg.Codec[],
    proprietary: ffmpeg.Codec[],
}

export const KNOWN_PROPRIETARY_CODECS = new Set(['h264', 'aac']);

export async function checkFfmpeg(options: CheckFfmpegOptions = {}): Promise<void> {
    const {
        ffmpegPath = ffmpeg.ffmpegAbsolutePath(options),
        json = false,
    } = options;
    const codecs = ffmpeg.getFfmpegCodecs(ffmpegPath);
    const free = [];
    const proprietary = [];
    for (const codec of codecs) {
        if (KNOWN_PROPRIETARY_CODECS.has(codec.name.toLowerCase())) {
            proprietary.push(codec);
        } else {
            free.push(codec);
        }
    }
    if (json) {
        // Pretty format JSON on stdout.
        const result: CheckFfmpegResult = { free, proprietary };
        console.log(JSON.stringify(result, undefined, 2));
    }
    if (proprietary.length > 0) {
        // Should be displayed on stderr to not pollute the JSON on stdout.
        throw new Error(`${proprietary.length} proprietary codecs found\n${proprietary.map(codec => `> ${codec.name} detected (${codec.longName})`).join('\n')}`);
    }
    // Print to stderr to not pollute the JSON on stdout.
    console.warn(`"${ffmpegPath}" does not contain proprietary codecs (${codecs.length} found).`);
}
