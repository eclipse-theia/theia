/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { IPreferenceServer } from './preference-server'
import { DefaultPreferenceServer, PreferenceContribution, Preference } from './default-preference-server'
import { ContributionProvider } from '../../application/common/contribution-provider'
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;
let server: IPreferenceServer;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
    server = new DefaultPreferenceServer(new PrefProviderStub());
});

describe('default preference-server', () => {
    describe('01 #default has preference', () => {
        it('should return true for the existing preference', () => {
            return expect(server.has("testBooleanTrue")).to.eventually.equal(true);
        });

        it('should return false for the unexisting preference', () => {
            return expect(server.has("testBooleanUndefined")).to.eventually.equal(false);
        });
    });

    describe('02 #default get preference', () => {

        it('should return value for the get preference', () => {
            return expect(server.get("testStringSomething")).to.eventually.equal("testStringSomethingValue");
        });
        it('should return undefined for the unexisting preference', () => {
            return expect(server.get("testStringSomethingThatDoesntExist")).to.eventually.equal(undefined);
        });
    })
});


class PrefProviderStub implements ContributionProvider<PreferenceContribution> {
    getContributions(): PreferenceContribution[] {

        let prefs1: Preference[] = [
            {
                name: "testBooleanTrue",
                defaultValue: true,
                description: "testBooleanTrue description"
            },
            {
                name: "testBooleanTrue",
                defaultValue: false,
                description: "testBooleanFalse"
            }
        ];

        let prefs2: Preference[] = [
            {
                name: "testStringSomething",
                defaultValue: "testStringSomethingValue",
                description: "testStringSomething description"
            },
            {
                name: "testStringSomething2",
                defaultValue: "testStringSomethingValue2"
            }
        ];

        let prefContrib: PreferenceContribution[] = [new PreferenceContributionStub(prefs1), new PreferenceContributionStub(prefs2)];

        return prefContrib;

    }
}

class PreferenceContributionStub implements PreferenceContribution {
    constructor(readonly preferences: Preference[]
    ) { }
}
