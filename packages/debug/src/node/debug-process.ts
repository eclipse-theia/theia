/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export const IDebugProcess = "IDebugProcess";
import { Event } from '@theia/core/lib/common';
import { IProcessExitEvent } from '@theia/process/lib/node';

export interface IDebugProcess {
    readStream: NodeJS.ReadableStream;
    writeStream: NodeJS.WritableStream;
    process: any;
    terminal: any;
    onExit: Event<IProcessExitEvent>;
    onError: Event<Error>;
}
