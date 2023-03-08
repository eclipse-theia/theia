// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { assert } from 'chai';
import { ReferenceCounterImpl } from './rc-impl';

describe('Rc', () => {

    const referenceCounter = new ReferenceCounterImpl();

    class DisposableObject {
        disposed = false;
        dispose(): void {
            this.disposed = true;
        }
    }

    it('should dispose the value only when no Rc are left', () => {
        const value = new DisposableObject();
        const rcs = [];
        const rcCount = 20;
        // create a bunch of Rc:
        for (let i = 0; i < rcCount; i++) {
            rcs.push(referenceCounter.getRc(value));
        }
        assert.isFalse(value.disposed, 'value should not be disposed (1)');
        // dispose all but one Rc:
        for (let i = 0; i < rcCount - 1; i++) {
            rcs.pop()!.dispose();
        }
        assert.isFalse(value.disposed, 'value should not be disposed (2)');
        // dispose the last remaining Rc:
        rcs.pop()!.dispose();
        assert.isTrue(value.disposed, 'value should be disposed');
    });

    it('should track how many Rc are valid', () => {
        const value = new DisposableObject();
        const a = referenceCounter.getRc(value);
        assert.strictEqual(a.count, 1);
        const b = referenceCounter.getRc(value);
        assert.strictEqual(a.count, 2);
        assert.strictEqual(b.count, 2);
        a.dispose();
        assert.strictEqual(b.count, 1);
    });

    it('should always return a new Rc', () => {
        const value = new DisposableObject();
        const a = referenceCounter.getRc(value);
        const b = referenceCounter.getRc(value);
        assert.notStrictEqual(a, b);
    });

    it('cloning should increase the count', () => {
        const value = new DisposableObject();
        const a = referenceCounter.getRc(value);
        assert.strictEqual(a.count, 1);
        const b = a.clone();
        assert.strictEqual(a.count, 2);
        assert.strictEqual(b.count, 2);
    });

    it('cloning should return a new Rc', () => {
        const value = new DisposableObject();
        const a = referenceCounter.getRc(value);
        const b = a.clone();
        assert.notStrictEqual(a, b);
    });
});
