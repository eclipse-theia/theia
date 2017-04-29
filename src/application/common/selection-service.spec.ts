/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { SelectionService } from './selection-service';
import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

beforeEach(() => {
});

describe('selection-service', () => {

    describe('01 #addListener and dispose', () => {
        it('Should be rejected when path argument is undefined.', () => {
            let service = createSelectionService();
            let events: any[] = [];
            let disposable = service.onSelectionChanged(
                e => events.push(e)
            );
            service.selection = "foo";
            disposable.dispose();
            service.selection = "bar";
            expect(events.length).equals(1);
            expect(events[0]).equals("foo");
        });
    });
});

function createSelectionService() {
    return new SelectionService();
}
