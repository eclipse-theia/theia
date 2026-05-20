// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    getImplicitDevPort,
    isReservedIdePort,
    pickAlternateDevPort,
    resolveBootstrapDevPort,
    wrapDevCommandForPort,
} from './qaap-project-bootstrap-port';

describe('qaap-project-bootstrap-port', () => {

    it('pickAlternateDevPort prefers 3001 when framework defaults to 3000', () => {
        expect(pickAlternateDevPort(3000, 3000)).to.equal(3001);
    });

    it('resolveBootstrapDevPort shifts off the IDE listener', () => {
        expect(resolveBootstrapDevPort(3000, 3000)).to.equal(3001);
        expect(resolveBootstrapDevPort(5173, 3000)).to.equal(5173);
        expect(resolveBootstrapDevPort(3000, 3001)).to.equal(3000);
    });

    it('isReservedIdePort treats matching IDE port as reserved', () => {
        expect(isReservedIdePort(3000, 3000)).to.equal(true);
        expect(isReservedIdePort(3000, undefined)).to.equal(true);
        expect(isReservedIdePort(3000, 3001)).to.equal(false);
        expect(isReservedIdePort(3001, 3000)).to.equal(false);
    });

    it('resolveBootstrapDevPort shifts Next off :3000 even without browser ide port', () => {
        expect(resolveBootstrapDevPort(3000, undefined)).to.equal(3001);
    });

    it('wrapDevCommandForPort uses PORT= for CRA-style stacks', () => {
        expect(wrapDevCommandForPort('npm run dev', 3001, 'node-cra')).to.equal('PORT=3001 npm run dev');
    });

    it('wrapDevCommandForPort sets PORT and --port for Vite (overrides Docker IDE PORT)', () => {
        expect(wrapDevCommandForPort('npm run dev', 5174, 'node-vite')).to.equal('PORT=5174 npm run dev -- --port 5174');
    });

    it('getImplicitDevPort defaults generic Node apps to 3000', () => {
        expect(getImplicitDevPort('node-generic')).to.equal(3000);
        expect(getImplicitDevPort('node-vite')).to.equal(5173);
    });

    it('wrapDevCommandForPort passes -p to Next after PORT=', () => {
        expect(wrapDevCommandForPort('npm run dev', 3001, 'node-next')).to.equal('PORT=3001 npm run dev -- -p 3001');
    });
});
