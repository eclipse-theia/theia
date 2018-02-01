/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MockLogger } from '../../common/test/mock-logger';
import { FrontendConnectionStatusService } from '../connection-status-service';

export class MockConnectionStatusService extends FrontendConnectionStatusService {

    constructor() {
        super({
            retry: 3,
            maxRetryInterval: 10,
            retryInterval: 10,
            requestTimeout: 10
        }, new MockLogger());
    }

    public alive: boolean = true;

    protected async checkAlive(): Promise<boolean> {
        return this.alive;
    }

}
