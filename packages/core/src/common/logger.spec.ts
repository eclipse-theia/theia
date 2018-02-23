/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
