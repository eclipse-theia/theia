/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PreferenceService } from './preference-service';
import { IPreferenceServer } from './preference-server'
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

class PreferenceServerStub implements IPreferenceServer {
    has(preferenceName: string): Promise<boolean> {
        return new Promise(() => {
        })
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        switch (preferenceName) {
            case ("testNumber"): {
                return Promise.resolve<T | undefined>(<T><any>1);
            }
            case ("testBoolean"): {
                return Promise.resolve<T | undefined>(<T><any>true);
            }
            case ("testString"): {
                return Promise.resolve<T | undefined>(<T><any>"string");
            }
            default:
                return Promise.resolve(undefined);
        }
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

after(() => {
});

// class FileWatcherStub extends FileSystemWatcher {
//     getFileSystemClient(): FileSystemClient {
//         const emitter = this.onFileChangesEmitter
//         return {
//             onFileChanges(event: FileChangesEvent) {
//                 emitter.fire(event)
//             }
//         }
//     }

//     private onFileChangesEmitter = new Emitter<FileChangesEvent>();

//     get onFileChanges(): Event<FileChangesEvent> {
//         return this.onFileChangesEmitter.event;
//     }
// }

describe('preference-service', () => {
    describe('01 #getNumber', () => {
        it('should return true for the has preference', () => {
            // return expect(prefServer.has("lineNumbers")).to.eventually.equal(true);
            return expect(prefService.getNumber("testNumber")).to.eventually.equal(1);
        });

        // it('should return false for the has preference', () => {
        //     return expect(prefServer.has("nonExistingPref")).to.eventually.equal(false);
        // });
    });

    // describe('02 #get preference', () => {
    //     it('should get the value for the preference', () => {
    //         return expect(prefServer.get("lineNumbers")).is.eventually.equal("on");
    //     });

    //     it('should get no value for unknown preference', () => {
    //         return expect(prefServer.get("unknownPreference")).is.eventually.equal(undefined);
    //     });
    // })


});
