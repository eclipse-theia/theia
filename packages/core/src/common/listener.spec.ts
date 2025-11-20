// *****************************************************************************
// Copyright (C) 2025 ST Microelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import { ListenerList } from './listener';

describe('ListenerList<T, U>', () => {
    let listenerList: ListenerList<any, any>;

    beforeEach(() => {
        listenerList = new ListenerList<any, any>();
    });

    describe('registration and disposal', () => {
        it('should register a single listener and allow it to be invoked', () => {
            let listenerCalled = false;
            const testEvent = { data: 'test' };
            let receivedEvent: any;
            const listener = (e: any) => {
                listenerCalled = true;
                receivedEvent = e;
                return 'result';
            };

            listenerList.registration(listener);

            let callbackCalled = false;
            let callbackValue: any;
            listenerList.invoke(testEvent, value => {
                callbackCalled = true;
                callbackValue = value;
            });

            expect(listenerCalled).to.be.true;
            expect(receivedEvent).to.equal(testEvent);
            expect(callbackCalled).to.be.true;
            expect(callbackValue).to.equal('result');
        });

        it('should return a Disposable when a listener is registered', () => {
            const listener = () => { };
            const disposable = listenerList.registration(listener);
            expect(disposable).to.exist;
            expect(typeof disposable.dispose).to.equal('function');
        });

        it('should remove the listener when the Disposable is disposed', () => {
            let listenerCallCount = 0;
            const listener = () => {
                listenerCallCount++;
            };

            const disposable = listenerList.registration(listener);
            disposable.dispose();

            listenerList.invoke({}, () => { });

            expect(listenerCallCount).to.equal(0);
        });

        it('should register multiple listeners and invoke all of them', () => {
            let listener1Called = false;
            let listener2Called = false;
            const results: any[] = [];

            const listener1 = (e: any) => { listener1Called = true; return e + 1; };
            const listener2 = (e: any) => { listener2Called = true; return e + 2; };

            listenerList.registration(listener1);
            listenerList.registration(listener2);

            listenerList.invoke(10, value => {
                results.push(value);
            });

            expect(listener1Called).to.be.true;
            expect(listener2Called).to.be.true;
            expect(results).to.deep.equal([11, 12]);
        });

        it('should dispose of a specific listener among multiple, leaving others active', () => {
            let listener1CallCount = 0;
            let listener2CallCount = 0;
            const results: any[] = [];

            const listener1 = (e: any) => { listener1CallCount++; return 'L1'; };
            const listener2 = (e: any) => { listener2CallCount++; return 'L2'; };

            const disposable1 = listenerList.registration(listener1);
            listenerList.registration(listener2);

            disposable1.dispose();

            listenerList.invoke({}, value => {
                results.push(value);
            });

            expect(listener1CallCount).to.equal(0);
            expect(listener2CallCount).to.equal(1);
            expect(results).to.deep.equal(['L2']);
        });

        it('should handle disposing a listener that was already disposed (no error)', () => {
            const listener = () => { };
            const disposable = listenerList.registration(listener);

            disposable.dispose(); // First dispose
            expect(() => disposable.dispose()).to.not.throw(); // Second dispose

            // Ensure no listeners are invoked
            let invokeCallbackCalled = false;
            listenerList.invoke({}, () => { invokeCallbackCalled = true; });
            expect(invokeCallbackCalled).to.be.false;
        });

        it('should correctly transition internal listeners from single object to array', () => {
            const results: string[] = [];
            const callback = (value: string) => results.push(value);

            const listener1 = () => 'one';
            listenerList.registration(listener1);
            listenerList.invoke({}, callback);
            expect(results).to.deep.equal(['one']);
            results.length = 0; // Clear results

            const listener2 = () => 'two';
            listenerList.registration(listener2); // This should transition internal listeners to an array
            listenerList.invoke({}, callback);
            expect(results).to.deep.equal(['one', 'two']);
        });

        it('should correctly transition internal listeners from array to single object or undefined upon disposal', () => {
            const results: string[] = [];
            const callback = (value: string) => results.push(value);

            const listener1 = () => 'one';
            const listener2 = () => 'two';
            const listener3 = () => 'three';

            const d1 = listenerList.registration(listener1);
            const d2 = listenerList.registration(listener2);
            const d3 = listenerList.registration(listener3); // listeners: [l1, l2, l3]

            d2.dispose(); // listeners: [l1, l3]
            listenerList.invoke({}, callback);
            expect(results).to.deep.equal(['one', 'three']);
            results.length = 0;

            d1.dispose(); // listeners: [l3] (should become single object)
            listenerList.invoke({}, callback);
            expect(results).to.deep.equal(['three']);
            results.length = 0;

            // Verify it's a single object by checking the internal structure if possible,
            // or by behavior (e.g. adding another makes it an array of two)
            // For this test, we'll infer from behavior that if it works, it's correct.
            // Add another listener, then remove the current single one (d3)
            const listener4 = () => 'four';
            const d4 = listenerList.registration(listener4); // Now should be [l3, l4]
            listenerList.invoke({}, callback);
            expect(results).to.include.members(['three', 'four']);
            expect(results.length).to.equal(2);
            results.length = 0;

            d3.dispose(); // Now should be [l4] (single object)
            listenerList.invoke({}, callback);
            expect(results).to.deep.equal(['four']);
            results.length = 0;

            d4.dispose();
            listenerList.invoke({}, callback);
            expect(results.length).to.equal(0);
        });

        it('should correctly transition listeners to empty when last listener is removed', () => {
            const results: string[] = [];
            const callback = (value: string) => results.push(value);

            const listener1 = () => 'one';
            const d1 = listenerList.registration(listener1);
            listenerList.invoke({}, callback);
            expect(results).to.deep.equal(['one']);
            results.length = 0;

            d1.dispose();
            listenerList.invoke({}, callback);
            expect(results.length).to.equal(0);
        });
    });

    describe('invoke', () => {
        it('should not invoke callback if no listeners are registered', () => {
            let callbackCalled = false;
            listenerList.invoke({}, () => {
                callbackCalled = true;
            });
            expect(callbackCalled).to.be.false;
        });

        it('should pass the event object correctly to a single listener', () => {
            const testEvent = { id: 1, value: 'data' };
            let receivedEvent: any = undefined;
            const listener = (e: any) => {
                receivedEvent = e;
            };
            listenerList.registration(listener);
            listenerList.invoke(testEvent, () => { });
            expect(receivedEvent).to.deep.equal(testEvent);
        });

        it('should pass the event object correctly to multiple listeners', () => {
            const testEvent = { id: 2, value: 'more data' };
            let eventForL1: any = undefined;
            let eventForL2: any = undefined;

            const listener1 = (e: any) => { eventForL1 = e; };
            const listener2 = (e: any) => { eventForL2 = e; };

            listenerList.registration(listener1);
            listenerList.registration(listener2);
            listenerList.invoke(testEvent, () => { });

            expect(eventForL1).to.deep.equal(testEvent);
            expect(eventForL2).to.deep.equal(testEvent);
        });

        it('should call the callback with the return value of a single listener', () => {
            const expectedResult = 'unique_result';
            const listener = () => expectedResult;
            listenerList.registration(listener);

            let actualResult: any;
            listenerList.invoke({}, value => {
                actualResult = value;
            });
            expect(actualResult).to.equal(expectedResult);
        });

        it('should call the callback for each return value of multiple listeners', () => {
            const resultL1 = 'res1';
            const resultL2 = 'res2';
            const collectedResults: any[] = [];

            const listener1 = () => resultL1;
            const listener2 = () => resultL2;

            listenerList.registration(listener1);
            listenerList.registration(listener2);

            listenerList.invoke({}, value => {
                collectedResults.push(value);
            });

            expect(collectedResults).to.have.lengthOf(2);
            expect(collectedResults).to.include.members([resultL1, resultL2]);
        });

        it('should not invoke a listener after it has been disposed (re-check with invoke)', () => {
            let callCount = 0;
            const listener = () => { callCount++; };
            const disposable = listenerList.registration(listener);

            listenerList.invoke({}, () => { }); // Should call once
            expect(callCount).to.equal(1);

            disposable.dispose();
            listenerList.invoke({}, () => { }); // Should not call again
            expect(callCount).to.equal(1); // Still 1
        });

        it('should handle invocation when listeners are added and removed dynamically', () => {
            const event1 = 'event1';
            const event2 = 'event2';
            const results: string[] = [];
            const invokeCallback = (val: string) => results.push(val);

            const listenerA = (e: string) => `A(${e})`;
            const listenerB = (e: string) => `B(${e})`;

            const dA = listenerList.registration(listenerA);
            listenerList.invoke(event1, invokeCallback);
            expect(results).to.deep.equal([`A(${event1})`]);
            results.length = 0;

            const dB = listenerList.registration(listenerB);
            listenerList.invoke(event1, invokeCallback);
            expect(results).to.deep.equal([`A(${event1})`, `B(${event1})`]); // Order is preserved
            results.length = 0;

            dA.dispose();
            listenerList.invoke(event2, invokeCallback);
            expect(results).to.deep.equal([`B(${event2})`]);
            results.length = 0;

            dB.dispose();
            listenerList.invoke(event2, invokeCallback);
            expect(results).to.deep.equal([]);
        });
    });
});
