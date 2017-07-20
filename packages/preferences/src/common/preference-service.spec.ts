// /*
//  * Copyright (C) 2017 Ericsson and others.
//  *
//  * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
//  * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
//  */

// import { PreferenceService } from './preference-service';
// import { PreferenceServer, PreferenceClient, PreferenceChangedEvent } from './preference-protocol'
// import * as chai from 'chai';
// import * as chaiAsPromised from 'chai-as-promised';

// const prefJson: { [key: string]: any } = {
//     "prefExists": true,
//     "testString1": "1",
//     "testNumber0": 0,
//     "testStringEmpty": "",
//     "testStringTrue": true,
//     "testString": "string",
//     "testBooleanTrue": true,
//     "testNumber1": 1,
// }

// class PreferenceServerStub implements PreferenceServer {
//     has(preferenceName: string): Promise<boolean> {
//         switch (preferenceName) {
//             case ("prefExists"): {
//                 return Promise.resolve(true);
//             }
//             default: {
//                 return Promise.resolve(false);
//             }
//         }
//     }

//     get<T>(preferenceName: string): Promise<T | undefined> {
//         switch (preferenceName) {
//             case ("testString1"): {
//                 return Promise.resolve(<any>"1");
//             }
//             case ("testNumber0"): {
//                 return Promise.resolve(<any>0);
//             }
//             case ("testStringEmpty"): {
//                 return Promise.resolve(<any>"");
//             }
//             case ("testStringTrue"): {
//                 return Promise.resolve(<any>"true");
//             }
//             case ("testString"): {
//                 return Promise.resolve(<any>"string");
//             }
//             case ("testBooleanTrue"): {
//                 return Promise.resolve(<any>true);
//             }
//             case ("testNumber1"): {
//                 return Promise.resolve(<any>1);
//             }
//             default:
//                 return Promise.resolve(undefined);
//         }
//     }

//     protected client: PreferenceClient | undefined;

//     setClient(client: PreferenceClient) {
//         this.client = client;
//     }

//     ready(): Promise<void> {
//         return Promise.resolve(undefined);
//     }

//     onDidChangePreference(event: PreferenceChangedEvent): void {
//         if (this.client) {
//             this.client.onDidChangePreference(event);
//         }
//     }

//     dispose(): void { }

//     fireEvents() {
//         for (const field of Object.keys(prefJson)) {
//             const event = { preferenceName: field, newValue: prefJson[field] }
//             this.onDidChangePreference(event);
//         }
//     }
// }

// const expect = chai.expect;
// let prefService: PreferenceService;
// let prefStub: PreferenceServerStub;

// before(() => {
//     chai.config.showDiff = true;
//     chai.config.includeStack = true;
//     chai.should();
//     chai.use(chaiAsPromised);

//     prefStub = new PreferenceServerStub();
//     prefService = new PreferenceService(prefStub);

//     prefStub.fireEvents();
// });

// describe('preference-service  (simplified api)', () => {
//     let valNumber: number | undefined, valBoolean: boolean | undefined, valString: string | undefined;


//     it('should get the has() from the server', () => {
//         let hasValue = prefService.has("prefExists");
//         expect(hasValue).to.be.true;

//         hasValue = prefService.has("doesNotExist");
//         expect(hasValue).to.be.false;
//     });

//     it('should return the correct values without casting', () => {
//         valBoolean = prefService.getBoolean("testBooleanTrue");
//         expect(valBoolean).to.be.true;

//         valString = prefService.getString("testString");
//         expect(valString).to.be.equal("string");

//         valNumber = prefService.getNumber("testNumber1");
//         expect(valNumber).to.be.equal(1);
//     });

//     it('should return correct values when casting to other types', () => {
//         // should return true for a non-empty string
//         valBoolean = prefService.getBoolean("testString");
//         expect(valBoolean).to.be.true;

//         // should return false for an empty string
//         valBoolean = prefService.getBoolean("testStringEmpty");
//         expect(valBoolean).to.be.false;

//         // should return true for an non-zero number
//         valBoolean = prefService.getBoolean("testString1");
//         expect(valBoolean).to.be.true;

//         // should return false for an zero number
//         valBoolean = prefService.getBoolean("testNumber0");
//         expect(valBoolean).to.be.false;

//         // should return true value as a "true" string
//         valString = prefService.getString("testBooleanTrue")
//         expect(valString).to.be.equal("true");

//         // should return NaN for a NaN
//         valNumber = prefService.getNumber("testString");
//         expect(isNaN(valNumber!)).to.be.true;
//     })

//     it('should return undefined when wrong value and no default value supplied', () => {
//         // should return undefined for a non-existing boolean key
//         valBoolean = prefService.getBoolean("doesntExist");
//         expect(valBoolean).to.be.undefined;

//         // should return undefined for a non-existing string key
//         valString = prefService.getString("doesntExist");
//         expect(valBoolean).to.be.undefined;

//         // should return undefined for a non-existing number key
//         valNumber = prefService.getNumber("doesntExist");
//         expect(valNumber).to.be.undefined;
//     });

//     it('should return the default values', () => {
//         // should return the default value for a boolean
//         valBoolean = prefService.getBoolean("doesntExist", true);
//         expect(valBoolean).to.be.true;

//         // should return the default value for a string
//         valString = prefService.getString("doesntExist", "true");
//         expect(valString).to.be.equal("true");

//         // should return the default value for a number
//         valNumber = prefService.getNumber("doesntExist", 57);
//         expect(valNumber).to.be.equal(57);
//     });

//     it('register for preference change and receive event', async () => {

//         const events: PreferenceChangedEvent[] = [
//             { preferenceName: "test" },
//             { preferenceName: "test2", newValue: true },
//             { preferenceName: "test3", newValue: true, oldValue: false },
//         ]

//         prefService.onPreferenceChanged((event) => {
//             switch (event.preferenceName) {
//                 case ("test"): {
//                     expect(event.newValue).to.be.undefined;
//                     break;
//                 }
//                 case ("test2"): {
//                     expect(event.newValue).to.be.true;
//                     expect(event.oldValue).to.be.undefined;
//                     break;
//                 }
//                 case ("test3"): {
//                     expect(event.newValue).to.be.true;
//                     expect(event.oldValue).to.be.false;
//                     break;
//                 }
//             }
//         })

//         for (const event of events) {
//             prefStub.onDidChangePreference(event);
//         }
//     });
// });
