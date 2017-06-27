/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PreferenceService } from './preference-service';
import { IPreferenceServer, IPreferenceClient } from './preference-protocol'
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

class PreferenceServerStub implements IPreferenceServer {
    has(preferenceName: string): Promise<boolean> {
        switch (preferenceName) {
            case ("prefExists"): {
                return Promise.resolve(true);
            }
            default: {
                return Promise.resolve(false);
            }
        }
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        switch (preferenceName) {
            case ("testString1"): {
                return Promise.resolve(<any>"1");
            }
            case ("testNumber0"): {
                return Promise.resolve(<any>0);
            }
            case ("testStringEmpty"): {
                return Promise.resolve(<any>"");
            }
            case ("testStringTrue"): {
                return Promise.resolve(<any>"true");
            }
            case ("testString"): {
                return Promise.resolve(<any>"string");
            }
            case ("testBooleanTrue"): {
                return Promise.resolve(<any>true);
            }
            case ("testNumber1"): {
                return Promise.resolve(<any>1);
            }
            default:
                return Promise.resolve(undefined);
        }
    }

    setClient(client: IPreferenceClient) {

    }
}

const expect = chai.expect;
let prefService: PreferenceService;
let prefStub: IPreferenceServer;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);

    prefStub = new PreferenceServerStub();
    prefService = new PreferenceService(prefStub);
});

describe('preference-service  (simplified api)', () => {
    let valNumber: number | undefined, valBoolean: boolean | undefined, valString: string | undefined;


    it('should get the has() from the server', async () => {
        let hasValue = await prefService.has("prefExists");
        expect(hasValue).to.be.true;

        hasValue = await prefService.has("doesNotExist");
        expect(hasValue).to.be.false;
    });

    it('should return the correct values without casting', async () => {
        valBoolean = await prefService.getBoolean("testBooleanTrue");
        expect(valBoolean).to.be.true;

        valString = await prefService.getString("testString");
        expect(valString).to.be.equal("string");

        valNumber = await prefService.getNumber("testNumber1");
        expect(valNumber).to.be.equal(1);
    });

    it('should return correct values when casting to other types', async () => {
        // should return true for a non-empty string
        valBoolean = await prefService.getBoolean("testString");
        expect(valBoolean).to.be.true;

        // should return false for an empty string
        valBoolean = await prefService.getBoolean("testStringEmpty");
        expect(valBoolean).to.be.false;

        // should return true for an non-zero number
        valBoolean = await prefService.getBoolean("testString1");
        expect(valBoolean).to.be.true;

        // should return false for an zero number
        valBoolean = await prefService.getBoolean("testNumber0");
        expect(valBoolean).to.be.false;

        // should return true value as a "true" string
        valString = await prefService.getString("testBooleanTrue")
        expect(valString).to.be.equal("true");

        // should return undefined for a NaN
        valNumber = await prefService.getNumber("testString");
        expect(valNumber).to.be.undefined;
    })

    it('should return undefined when wrong value and no default value supplied', async () => {
        // should return undefined for a non-existing boolean key
        valBoolean = await prefService.getBoolean("doesntExist");
        expect(valBoolean).to.be.undefined;

        // should return undefined for a non-existing string key
        valString = await prefService.getString("doesntExist");
        expect(valBoolean).to.be.undefined;

        // should return undefined for a non-existing number key
        valNumber = await prefService.getNumber("doesntExist");
        expect(valNumber).to.be.undefined;
    });

    it('should return the default values', async () => {
        // should return the default value for a boolean
        valBoolean = await prefService.getBoolean("doesntExist", true);
        expect(valBoolean).to.be.true;

        // should return the default value for a string
        valString = await prefService.getString("doesntExist", "true");
        expect(valString).to.be.equal("true");

        // should return the default value for a number
        valNumber = await prefService.getNumber("doesntExist", 57);
        expect(valNumber).to.be.equal(57);
    });
});
