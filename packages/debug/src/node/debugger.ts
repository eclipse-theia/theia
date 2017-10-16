/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { IDebugProcess } from './debug-process';

export interface IDebugger {
    id: number,
    /* FIXME use a base options */
    start(options: object): void;
    debugProcess: IDebugProcess;
}


/* FIXME add base debugger class */
