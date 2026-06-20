// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { expect } from 'chai';
import { Emitter } from './event';

describe('Event Objects', () => {

    it('Emitter firing should be synchronous', () => {
        const emitter = new Emitter<undefined>();
        let counter = 0;

        emitter.event(() => counter++);
        expect(counter).eq(0);
        emitter.fire(undefined);
        expect(counter).eq(1);
    });

    describe('Emitter errorHandling option', () => {

        it('should log errors by default', () => {
            const emitter = new Emitter<void>();
            const errors: unknown[] = [];
            const originalError = console.error;
            console.error = (e: unknown) => errors.push(e);

            try {
                emitter.event(() => { throw new Error('test error'); });
                emitter.fire(undefined);

                expect(errors).to.have.lengthOf(1);
                expect((errors[0] as Error).message).to.equal('test error');
            } finally {
                console.error = originalError;
            }
        });

        it('should propagate a single error when errorHandling is propagate', () => {
            const emitter = new Emitter<void>({ errorHandling: 'propagate' });

            emitter.event(() => { throw new Error('boom'); });

            expect(() => emitter.fire(undefined)).to.throw('boom');
        });

        it('should call all listeners before propagating the error', () => {
            const emitter = new Emitter<void>({ errorHandling: 'propagate' });
            let secondCalled = false;

            emitter.event(() => { throw new Error('first fails'); });
            emitter.event(() => { secondCalled = true; });

            expect(() => emitter.fire(undefined)).to.throw('first fails');
            expect(secondCalled).to.be.true;
        });

        it('should throw AggregateError when multiple listeners fail with propagate', () => {
            const emitter = new Emitter<void>({ errorHandling: 'propagate' });

            emitter.event(() => { throw new Error('error 1'); });
            emitter.event(() => { throw new Error('error 2'); });

            try {
                emitter.fire(undefined);
                expect.fail('Expected an error to be thrown');
            } catch (err) {
                expect(err).to.be.instanceOf(AggregateError);
                const aggregate = err as AggregateError;
                expect(aggregate.errors).to.have.lengthOf(2);
                expect(aggregate.errors[0].message).to.equal('error 1');
                expect(aggregate.errors[1].message).to.equal('error 2');
            }
        });

        it('should invoke custom error handler for each error', () => {
            const errors: unknown[] = [];
            const emitter = new Emitter<void>({ errorHandling: e => errors.push(e) });

            emitter.event(() => { throw new Error('handled 1'); });
            emitter.event(() => { throw new Error('handled 2'); });
            emitter.fire(undefined);

            expect(errors).to.have.lengthOf(2);
            expect((errors[0] as Error).message).to.equal('handled 1');
            expect((errors[1] as Error).message).to.equal('handled 2');
        });

        it('should not throw when no listeners fail with propagate', () => {
            const emitter = new Emitter<void>({ errorHandling: 'propagate' });
            let called = false;

            emitter.event(() => { called = true; });
            emitter.fire(undefined);

            expect(called).to.be.true;
        });
    });

});
