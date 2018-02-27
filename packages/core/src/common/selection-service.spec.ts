/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { SelectionService } from './selection-service';
import * as chai from "chai";

const expect = chai.expect;

describe('selection-service', () => {

    describe('01 #addListener and dispose', () => {
        it('Should be rejected when path argument is undefined.', () => {
            const service = createSelectionService();
            const events: any[] = [];
            const disposable = service.onSelectionChanged(
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
