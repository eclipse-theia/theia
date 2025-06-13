// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/base/test/common/observable.test.ts

import { expect } from 'chai';
import { DisposableCollection } from '../disposable';
import { Observable } from './observable-base';
import { SettableObservable } from './settable-observable';
import { DerivedObservable } from './derived-observable';
import { ObservableSignal } from './observable-signal';
import { Autorun } from './autorun';

describe('Observables', () => {
    let disposables: DisposableCollection;
    beforeEach(() => disposables = new DisposableCollection());
    afterEach(() => disposables.dispose());

    // Read these tests to understand how to use observables.
    describe('Tutorial', () => {
        it('settable observable & autorun', () => {
            const log = new Log();
            // This creates an observable with an initial value that can later be changed with the `set` method.
            const myObservable = SettableObservable.create(0);

            // This creates an autorun. The autorun has to be disposed!
            disposables.push(Autorun.create(() => { // This code runs immediately and then whenever any of the autorun's dependencies change.

                // Observables are automatically added to the tracked dependencies of the autorun as they are accessed with `get`.
                log.log(`myAutorun.run(myObservable: ${myObservable.get()})`);

                // Now that all dependencies are tracked, the autorun is re-run whenever any of the dependencies change.
            }));
            // The autorun runs immediately.
            expect(log.getAndClearEntries()).to.be.deep.equal(['myAutorun.run(myObservable: 0)']);

            myObservable.set(1);
            // The autorun runs again, because its dependency changed.
            expect(log.getAndClearEntries()).to.be.deep.equal(['myAutorun.run(myObservable: 1)']);

            myObservable.set(1);
            // The autorun didn't run, because the observable was set to the same value (no change).
            expect(log.getAndClearEntries()).to.be.deep.equal([]);

            // An update scope can be used to batch autorun runs.
            Observable.update(() => {
                myObservable.set(2);
                expect(log.getAndClearEntries()).to.be.deep.equal([]); // The autorun didn't run, even though its dependency changed!

                myObservable.set(3);
                expect(log.getAndClearEntries()).to.be.deep.equal([]);
            });
            // The autorun re-runs only at the end of the update scope.
            // Note that the autorun didn't see the intermediate value `2`!
            expect(log.getAndClearEntries()).to.be.deep.equal(['myAutorun.run(myObservable: 3)']);
        });

        it('derived observable & autorun', () => {
            const log = new Log();
            const observable1 = SettableObservable.create(0);
            const observable2 = SettableObservable.create(0);

            // This creates an observable that is derived from other observables.
            const myDerived = DerivedObservable.create(() => {
                // Dependencies are automatically tracked as they are accessed with `get`.
                const value1 = observable1.get();
                const value2 = observable2.get();
                const sum = value1 + value2;
                log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
                return sum;
            });

            // This creates an autorun that reacts to changes of the derived observable.
            disposables.push(Autorun.create(() => {
                log.log(`myAutorun(myDerived: ${myDerived.get()})`);
            }));
            // The autorun runs immediately...
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'myDerived.recompute: 0 + 0 = 0',
                'myAutorun(myDerived: 0)',
            ]);

            observable1.set(1);
            // ...and on changes...
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'myDerived.recompute: 1 + 0 = 1',
                'myAutorun(myDerived: 1)',
            ]);

            observable2.set(1);
            // ...of the derived observable.
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'myDerived.recompute: 1 + 1 = 2',
                'myAutorun(myDerived: 2)',
            ]);

            // Multiple observables can be updated in a batch.
            Observable.update(() => {
                observable1.set(5);
                expect(log.getAndClearEntries()).to.be.deep.equal([]);

                observable2.set(5);
                expect(log.getAndClearEntries()).to.be.deep.equal([]);
            });
            // The autorun re-runs only at the end of the update scope.
            // Derived observables are only recomputed on demand.
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'myDerived.recompute: 5 + 5 = 10',
                'myAutorun(myDerived: 10)',
            ]);

            Observable.update(() => {
                observable1.set(6);
                expect(log.getAndClearEntries()).to.be.deep.equal([]);

                observable2.set(4);
                expect(log.getAndClearEntries()).to.be.deep.equal([]);
            });
            // The autorun didn't run, because its dependency changed from 10 to 10 (no change).
            expect(log.getAndClearEntries()).to.be.deep.equal(['myDerived.recompute: 6 + 4 = 10']);
        });

        it('derived observable: get within update scope', () => {
            const log = new Log();
            const observable1 = SettableObservable.create(0);
            const observable2 = SettableObservable.create(0);

            const myDerived = DerivedObservable.create(() => {
                const value1 = observable1.get();
                const value2 = observable2.get();
                const sum = value1 + value2;
                log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
                return sum;
            });

            disposables.push(Autorun.create(() => {
                log.log(`myAutorun(myDerived: ${myDerived.get()})`);
            }));
            // The autorun runs immediately.
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'myDerived.recompute: 0 + 0 = 0',
                'myAutorun(myDerived: 0)',
            ]);

            Observable.update(() => {
                observable1.set(-10);
                expect(log.getAndClearEntries()).to.be.deep.equal([]);

                myDerived.get(); // This forces a (sync) recomputation of the current value!
                expect(log.getAndClearEntries()).to.be.deep.equal(['myDerived.recompute: -10 + 0 = -10']);
                // This means that, even within an update scope, all observable values you get are up-to-date.
                // It might just cause additional (potentially unneeded) recomputations.

                observable2.set(10);
                expect(log.getAndClearEntries()).to.be.deep.equal([]);
            });
            // The autorun runs again, because its dependency changed from 0 to -10 and then back to 0.
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'myDerived.recompute: -10 + 10 = 0',
                'myAutorun(myDerived: 0)',
            ]);
        });

        it('derived observable: get without observers', () => {
            const log = new Log();
            const observable1 = SettableObservable.create(0);

            const computed1 = DerivedObservable.create(() => {
                const value1 = observable1.get();
                const result = value1 % 3;
                log.log(`recompute1: ${value1} % 3 = ${result}`);
                return result;
            });
            const computed2 = DerivedObservable.create(() => {
                const value1 = computed1.get();
                const result = value1 * 2;
                log.log(`recompute2: ${value1} * 2 = ${result}`);
                return result;
            });
            const computed3 = DerivedObservable.create(() => {
                const value1 = computed1.get();
                const result = value1 * 3;
                log.log(`recompute3: ${value1} * 3 = ${result}`);
                return result;
            });
            const computedSum = DerivedObservable.create(() => {
                const value1 = computed2.get();
                const value2 = computed3.get();
                const result = value1 + value2;
                log.log(`recompute4: ${value1} + ${value2} = ${result}`);
                return result;
            });
            expect(log.getAndClearEntries()).to.be.deep.equal([]);

            observable1.set(1);
            // Derived observables are only recomputed on demand.
            expect(log.getAndClearEntries()).to.be.deep.equal([]);

            log.log(`value: ${computedSum.get()}`);
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'recompute1: 1 % 3 = 1',
                'recompute2: 1 * 2 = 2',
                'recompute3: 1 * 3 = 3',
                'recompute4: 2 + 3 = 5',
                'value: 5',
            ]);

            log.log(`value: ${computedSum.get()}`);
            // Because there are no observers, the derived observable values are not cached (!) but recomputed from scratch.
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'recompute1: 1 % 3 = 1',
                'recompute2: 1 * 2 = 2',
                'recompute3: 1 * 3 = 3',
                'recompute4: 2 + 3 = 5',
                'value: 5',
            ]);

            // keepObserved can be used to keep the cache alive.
            const disposable = Observable.keepObserved(computedSum);
            log.log(`value: ${computedSum.get()}`);
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'recompute1: 1 % 3 = 1',
                'recompute2: 1 * 2 = 2',
                'recompute3: 1 * 3 = 3',
                'recompute4: 2 + 3 = 5',
                'value: 5',
            ]);

            log.log(`value: ${computedSum.get()}`);
            // Tada, no recomputations!
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'value: 5',
            ]);

            observable1.set(2);
            // keepObserved does not force derived observables to be recomputed.
            expect(log.getAndClearEntries()).to.be.deep.equal([]);

            log.log(`value: ${computedSum.get()}`);
            // Derived observables are only recomputed on demand...
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'recompute1: 2 % 3 = 2',
                'recompute2: 2 * 2 = 4',
                'recompute3: 2 * 3 = 6',
                'recompute4: 4 + 6 = 10',
                'value: 10',
            ]);
            log.log(`value: ${computedSum.get()}`);
            // ...and then cached again.
            expect(log.getAndClearEntries()).to.be.deep.equal(['value: 10']);

            // Don't forget to dispose the disposable returned by keepObserved!
            disposable.dispose();

            log.log(`value: ${computedSum.get()}`);
            // The cache is disabled again.
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'recompute1: 2 % 3 = 2',
                'recompute2: 2 * 2 = 4',
                'recompute3: 2 * 3 = 6',
                'recompute4: 4 + 6 = 10',
                'value: 10',
            ]);

            log.log(`value: ${computedSum.get()}`);
            expect(log.getAndClearEntries()).to.be.deep.equal([
                'recompute1: 2 % 3 = 2',
                'recompute2: 2 * 2 = 4',
                'recompute3: 2 * 3 = 6',
                'recompute4: 4 + 6 = 10',
                'value: 10',
            ]);
        });

        it('autorun that receives change information of signals', () => {
            const log = new Log();

            // A signal is an observable without a value.
            // However, it can ship change information when it is triggered.
            const signal = ObservableSignal.create<{ msg: string }>();

            disposables.push(Autorun.create(({ changeSummary }) => {
                signal.get(); // This makes sure the signal is tracked as a dependency of the autorun.
                log.log('msgs: ' + changeSummary!.msgs.join(', '));
            }, {
                // A change summary can be used to collect the reported changes.
                createChangeSummary: () => ({ msgs: [] as string[] }),
                willHandleChange: (context, changeSummary) => {
                    if (context.isChangeOf(signal)) {
                        changeSummary!.msgs.push(context.change.msg);
                    }
                    return true;
                },
            }));

            signal.trigger({ msg: 'foobar' });

            // An update scope can be used to batch triggering signals.
            // No change information is lost!
            Observable.update(() => {
                signal.trigger({ msg: 'hello' });
                signal.trigger({ msg: 'world' });
            });

            expect(log.getAndClearEntries()).to.be.deep.equal([
                'msgs: ',
                'msgs: foobar',
                'msgs: hello, world'
            ]);
        });
    });
});

class Log {
    private readonly entries: string[] = [];

    log(message: string): void {
        this.entries.push(message);
    }

    getAndClearEntries(): string[] {
        const entries = [...this.entries];
        this.entries.length = 0;
        return entries;
    }
}
