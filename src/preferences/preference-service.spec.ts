/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PreferenceService, Preference, PreferenceChangeEvent } from './preference-service';
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

describe('preference-service', () => {

    describe('01 #addListener', () => {
        it('Should receive the event from the preference service', () => {
            let service = createPreferenceService();
            let exemplePref: boolean = false;

            let disposable = service.onPreferenceChanged((event: PreferenceChangeEvent) => {
                exemplePref = event.pref.value;
            })

            expect(exemplePref).is.false;
            let newPref: Preference = new Preference("test", true);
            service.setPref(newPref);
            expect(exemplePref).is.true;

            disposable.dispose();
            newPref.value = false;
            service.setPref(newPref);
            expect(exemplePref).is.true;
        });
    });
});

function createPreferenceService() {
    return new PreferenceService();
}
