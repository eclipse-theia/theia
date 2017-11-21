/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { DefaultOpenerService, OpenHandler } from './opener-service';
import * as assert from 'assert';

const id = 'my-opener';
const openHandler: OpenHandler = {
    id,
    label: 'My Opener',
    canHandle() {
        return Promise.resolve(1);
    },
    open() {
        return Promise.resolve(undefined);
    }
};
const openerService = new DefaultOpenerService({
    getContributions: () => [openHandler]
});

describe("opener-service", () => {

    it("getOpeners", () => {
        return openerService.getOpeners().then(openers => {
            assert.deepStrictEqual([openHandler], openers);
        });
    });

});
