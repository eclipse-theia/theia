/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as chaiAsPromised from "chai-as-promised";
import * as temp from 'temp';
import * as fs from 'fs-extra';

import { CompoundPreferenceServer, DefaultPreferenceServer } from '@theia/preferences-api'
import { JsonPrefHelper, PrefProviderStub } from '../node/test/preference-stubs'
import { FileUri } from '@theia/core/lib/node/file-uri';

const expect = chai.expect;
const track = temp.track();
const preferencePath = '.theia/prefs.json';

let compoundPrefServer: CompoundPreferenceServer;

before(() => {
    chai.should();
    chai.use(chaiAsPromised);
    chai.config.showDiff = true;
    chai.config.includeStack = true;

    const rootUri = FileUri.create(track.mkdirSync());
    let preferenceFileUri = rootUri.resolve(preferencePath);
    fs.mkdirSync(FileUri.fsPath(rootUri.resolve('.theia')));
    fs.writeFileSync(FileUri.fsPath(preferenceFileUri), '{ "showLineNumbers": false }');

    const jsonPrefServer = (new JsonPrefHelper()).createJsonPrefServer(preferenceFileUri);
    const defaultPrefServer = new DefaultPreferenceServer(new PrefProviderStub());
    compoundPrefServer = new CompoundPreferenceServer(jsonPrefServer, defaultPrefServer);
});

after(() => {
    compoundPrefServer.dispose();
    track.cleanupSync();
})

describe('compound-preference-server', () => {

    describe('01 #has preference', () => {
        it('should return true for the has preference (json server)', async () => {
            const actual = await compoundPrefServer.has("showLineNumbers");
            expect(actual).to.be.true;
        });

        it('should return true for the testBooleanTrue preference (default provider)', async () => {
            const actual = await compoundPrefServer.has("testBooleanTrue");
            expect(actual).to.be.true;
        });

        it('should return false for an unexisting pref in all servers', async () => {
            const actual = await compoundPrefServer.has("undefinedPref");
            expect(actual).to.be.false;
        });
    });

    describe('02 #get preference', () => {
        it('should get the value from the json server', async () => {
            const actual = await compoundPrefServer.get("showLineNumbers");
            expect(actual).to.be.false;
        });

        it('should get the value from the default server', async () => {
            const actual = await compoundPrefServer.get("testBooleanTrue");
            expect(actual).to.be.true;
        });

        it('should get undefined for unexisting pref', async () => {
            const actual = await compoundPrefServer.get("undefinedPref");
            expect(actual).to.be.undefined;
        });
    });
});