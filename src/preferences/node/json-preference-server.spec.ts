/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as chaiAsPromised from "chai-as-promised";
import * as fs from 'fs-extra';
import * as temp from 'temp';
import { JsonPreferenceServer } from './json-preference-server'
import { FileUri } from '../../application/node/file-uri';
import { JsonPrefHelper } from '../node/test/preference-stubs'
import URI from '../../application/common/uri';

const expect = chai.expect;
const preferencePath = '.theia/prefs.json';
let preferenceFileUri: URI;
let prefServer: JsonPreferenceServer;
let helper = new JsonPrefHelper();
const track = temp.track();

before(() => {
    chai.should();
    chai.use(chaiAsPromised);
    chai.config.showDiff = true;
    chai.config.includeStack = true;

    const rootUri = FileUri.create(track.mkdirSync());
    preferenceFileUri = rootUri.resolve(preferencePath);
    fs.mkdirSync(FileUri.fsPath(rootUri.resolve('.theia')));
    fs.writeFileSync(FileUri.fsPath(preferenceFileUri), '{ "showLineNumbers": false }');

    prefServer = helper.createJsonPrefServer(preferenceFileUri);
});

after(() => {
    prefServer.dispose();
    track.cleanupSync();
});

describe('json-preference-server', () => {
    describe('01 #has preference', () => {

        it('should return true for the has preference', async () => {
            const actual = await prefServer.has("showLineNumbers");
            expect(actual).to.be.true;
        });

        it('should return false for the has preference', async () => {
            const actual = await prefServer.has("missingPreferenceKey");
            expect(actual).to.be.false;
        });

    });

    describe('02 #get preference', () => {

        it('should get the value for the preference', async () => {
            const actual = await prefServer.get("showLineNumbers");
            expect(actual).to.be.false;
        });

        it('should get no value for unknown preference', async () => {
            const actual = await prefServer.get("unknownPreference");
            expect(actual).to.be.undefined;
        });

    });

    describe('03 #register and wait for pref change', () => {

        it('should get notified of changed pref with the correct new/old values', async () => {

            // Register a simple client
            let promise: Promise<boolean> = new Promise<boolean>((done) => {
                let eventNumbers: number = 0;
                prefServer.setClient({
                    onDidChangePreference(event) {
                        if (event.preferenceName === 'showLineNumbers') {
                            expect(event.newValue).to.be.equal(true);
                            expect(event.oldValue).to.be.equal(false);
                            eventNumbers++;
                        } else if (event.preferenceName === 'tabWidth') {
                            expect(event.newValue).to.be.equal(8);
                            eventNumbers++;
                        }
                        if (eventNumbers === 2) {
                            done();
                        }
                    }
                })
            })

            // Make sure, it is `true` by default.
            const initialState = await prefServer.get("showLineNumbers");
            expect(initialState).to.be.false;

            const fileContent = '{"showLineNumbers":true,"tabWidth":8}'; // Invalid json

            // Modify the content.
            fs.writeFileSync(FileUri.fsPath(preferenceFileUri), fileContent);

            let { content } = await helper.getFS().resolveContent(FileUri.fsPath(preferenceFileUri));
            expect(content).to.be.equal(fileContent);

            return promise;

        }).timeout(20000)


    });
    describe('03 #write invalid json pref file', () => {

        it('should log an error and have undefined prefs', async () => {

            // Register a simple client
            let promise: Promise<boolean> = new Promise<boolean>((done) => {
                prefServer.setClient({
                    onDidChangePreference(event) {
                        expect(event.newValue).to.be.equal(undefined);
                        done();
                    }
                })
            })

            const fileContent = '{showLineNumbers":tue'; // Invalid json

            // Modify the content.
            fs.writeFileSync(FileUri.fsPath(preferenceFileUri), fileContent);

            let { content } = await helper.getFS().resolveContent(FileUri.fsPath(preferenceFileUri));
            expect(content).to.be.equal(fileContent);

            return promise;

        }).timeout(20000)
    });
});

