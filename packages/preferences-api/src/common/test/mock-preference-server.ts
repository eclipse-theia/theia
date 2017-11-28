/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { PreferenceServer, PreferenceClient } from '../preference-protocol';

@injectable()
export class MockPreferenceServer implements PreferenceServer {
    constructor() { }
    setClient(client: PreferenceClient | undefined): void { }
    dispose(): void { }
}
