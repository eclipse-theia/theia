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

import path = require('path');

export interface Codec {
    id: number
    name: string
    longName: string
}

export interface FfmpegNativeAddon {
    codecs(ffmpegPath: string): Codec[]
}

export interface FfmpegNameAndLocation {
    /**
     * Name with extension of the shared library.
     */
    name: string
    /**
     * Relative location of the file from Electron's dist root.
     */
    location: string
}

export interface FfmpegOptions {
    electronVersion?: string
    electronDist?: string
    ffmpegPath?: string
    platform?: NodeJS.Platform
}

/**
 * @internal
 */
export function _loadFfmpegNativeAddon(): FfmpegNativeAddon {
    try {
        return require('../build/Release/ffmpeg.node');
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            return require('../build/Debug/ffmpeg.node');
        } else {
            throw error;
        }
    }
}

/**
 * @returns name and relative path from Electron's root where FFMPEG is located at.
 */
export function ffmpegNameAndLocation({
    platform = process.platform
}: FfmpegOptions = {}): FfmpegNameAndLocation {
    switch (platform) {
        case 'darwin':
            return {
                name: 'libffmpeg.dylib',
                location: 'Electron.app/Contents/Frameworks/Electron Framework.framework/Libraries/',
            };
        case 'win32':
            return {
                name: 'ffmpeg.dll',
                location: '',
            };
        case 'linux':
            return {
                name: 'libffmpeg.so',
                location: '',
            };
        default:
            throw new Error(`${platform} is not supported`);
    }
}

/**
 * @returns relative ffmpeg shared library path from the Electron distribution root.
 */
export function ffmpegRelativePath(options: FfmpegOptions = {}): string {
    const { location, name } = ffmpegNameAndLocation(options);
    return path.join(location, name);
}

/**
 * @returns absolute ffmpeg shared library path.
 */
export function ffmpegAbsolutePath(options: FfmpegOptions = {}): string {
    const {
        electronDist = path.resolve(require.resolve('electron/package.json'), '..', 'dist')
    } = options;
    return path.join(electronDist, ffmpegRelativePath(options));
}

/**
 * Dynamically link to `ffmpegPath` and use FFMPEG APIs to list the included `Codec`s.
 * @param ffmpegPath absolute path the the FFMPEG shared library.
 * @returns list of codecs for the given ffmpeg shared library.
 */
export function getFfmpegCodecs(ffmpegPath: string): Codec[] {
    return _loadFfmpegNativeAddon().codecs(ffmpegPath);
}
