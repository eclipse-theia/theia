/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

declare var v8debug: any;
function isInDebugMode(): boolean {
    if (typeof v8debug === 'object') {
        return true;
    }
    if (process && process.execArgv) {
        return process.execArgv.some(arg =>
            /^--debug=?/.test(arg) || /^--debug-brk=?/.test(arg)
        );
    }
    return false;
}
export const DEBUG_MODE = isInDebugMode();
