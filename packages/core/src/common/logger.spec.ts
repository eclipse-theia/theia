/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import { MockLogger } from './test/mock-logger';
import { setRootLogger, unsetRootLogger } from './logger';

// tslint:disable:no-unused-expression

describe('logger', () => {

    it('window is not defined', () => {
        expect(() => { window; }).to.throw(ReferenceError, /window is not defined/);
    });

    it('window is not defined when converting to boolean', () => {
        expect(() => { !!window; }).to.throw(ReferenceError, /window is not defined/);
    });

    it('window is not defined safe', () => {
        expect(() => { typeof window !== 'undefined'; }).to.not.throw(ReferenceError);
    });

    it('setting the root logger should not throw an error when the window is not defined', () => {
        expect(() => {
            try {
                setRootLogger(new MockLogger());
            } finally {
                unsetRootLogger();
            }
        }
        ).to.not.throw(ReferenceError);
    });

});
