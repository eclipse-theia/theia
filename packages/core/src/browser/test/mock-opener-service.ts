/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { OpenerService, OpenHandler } from '../opener-service';

/**
 * Mock opener service implementation for testing. Never provides handlers, but always rejects :)
 */
@injectable()
export class MockOpenerService implements OpenerService {

    async getOpeners(): Promise<OpenHandler[]> {
        return [];
    }

    async getOpener(): Promise<OpenHandler> {
        throw new Error(`MockOpenerService is for testing only.`);
    }

}
