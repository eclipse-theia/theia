/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { createPreferenceProxy } from "./preference-proxy";
import { MockPreferenceService } from "./test/mock-preference-service";
import { expect } from 'chai';

describe('preference proxy', function() {
    /** Verify the return type of the ready property.  */
    it('.ready should return a promise', function() {

        const proxy = createPreferenceProxy(new MockPreferenceService(), {
            properties: {}
        });
        const proto = Object.getPrototypeOf(proxy.ready);
        expect(proto).to.equal(Promise.prototype);
    });
});
