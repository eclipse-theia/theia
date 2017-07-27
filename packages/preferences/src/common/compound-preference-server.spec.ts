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

import { CompoundPreferenceServer } from '@theia/preferences-api'
import { JsonPrefHelper } from '../node/test/preference-stubs'
import { FileUri } from '@theia/core/lib/node/file-uri';

const expect = chai.expect;
const track = temp.track();
const preferencePath = '.theia/prefs.json';

let compoundPrefServer: CompoundPreferenceServer;
let preferenceFileUri: any;
let helper = new JsonPrefHelper();


before(() => {
    chai.should();
    chai.use(chaiAsPromised);
    chai.config.showDiff = true;
    chai.config.includeStack = true;

    const rootUri = FileUri.create(track.mkdirSync());
    preferenceFileUri = rootUri.resolve(preferencePath);
    fs.mkdirSync(FileUri.fsPath(rootUri.resolve('.theia')));
    fs.writeFileSync(FileUri.fsPath(preferenceFileUri), '');

    const jsonPrefServer = helper.createJsonPrefServer(preferenceFileUri);
    compoundPrefServer = new CompoundPreferenceServer(jsonPrefServer);
});

after(() => {
    compoundPrefServer.dispose();
    track.cleanupSync();
})

describe('compound-preference-server', () => {
    it('register a client', async () => {

        // Register a simple client
        let promise: Promise<boolean> = new Promise<boolean>((done) => {
            compoundPrefServer.setClient({
                onDidChangePreference(event) {
                    for (const change of event.changes) {
                        switch (change.preferenceName) {
                            case "showLineNumbers":
                                expect(change.newValue).to.be.true;
                                done();
                                break;
                        }
                    }
                }
            })
        })

        const fileContent = '{ "showLineNumbers": true }';

        // Modify the content.
        fs.writeFileSync(FileUri.fsPath(preferenceFileUri), fileContent);

        let { content } = await helper.getFS().resolveContent(FileUri.fsPath(preferenceFileUri));
        expect(content).to.be.equal(fileContent);

        helper.getWatcher().fireEvents(
            {
                changes: [{
                    uri: preferenceFileUri.toString(),
                    type: 0
                }]
            }
        )

        return promise;

    })
});
