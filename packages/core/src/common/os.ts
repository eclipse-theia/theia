/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

function is(userAgent: string, platform: string): boolean {
    if (typeof navigator !== 'undefined') {
        if (navigator.userAgent && navigator.userAgent.indexOf(userAgent) >= 0) {
            return true;
        }
    }
    if (typeof process !== 'undefined') {
        return (process.platform === platform);
    }
    return false;
}

export const isWindows = is('Windows', 'win32');
export const isOSX = is('Mac', 'darwin');

export type CMD = [string, string[]];
export function cmd(command: string, ...args: string[]): CMD {
    return [
        isWindows ? 'cmd' : command,
        isWindows ? ['/c', command, ...args] : args
    ];
}
