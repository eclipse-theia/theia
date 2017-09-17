/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractLogger, LogLevel } from '../logger';

/*
 * logger implementation to be used in unit tests.
 */
export class TestLogger extends AbstractLogger {

    constructor() {
        super();
        this.setLogLevel(LogLevel.ERROR);
    }

    protected getLog(logLevel: number): Promise<(message: string, ...params: any[]) => void> {
        return Promise.resolve((message: string) => {
            if (logLevel >= LogLevel.ERROR) {
                throw new Error(message);
            }
        });
    }
}
