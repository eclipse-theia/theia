// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import {
    ShellExecutionToolResult,
    ShellExecutionCanceledResult
} from './shell-execution-server';

describe('ShellExecutionToolResult.is', () => {
    it('should return true for valid result', () => {
        expect(ShellExecutionToolResult.is({ success: true, exitCode: 0, output: '', duration: 100 })).to.be.true;
    });

    it('should return false for invalid inputs', () => {
        expect(ShellExecutionToolResult.is(undefined)).to.be.false;
        // eslint-disable-next-line no-null/no-null
        expect(ShellExecutionToolResult.is(null)).to.be.false;
        expect(ShellExecutionToolResult.is({ exitCode: 0 })).to.be.false;
        expect(ShellExecutionToolResult.is({ success: true })).to.be.false;
    });
});

describe('ShellExecutionCanceledResult.is', () => {
    it('should return true for valid canceled result', () => {
        expect(ShellExecutionCanceledResult.is({ canceled: true })).to.be.true;
        expect(ShellExecutionCanceledResult.is({ canceled: true, output: 'partial', duration: 100 })).to.be.true;
    });

    it('should return false for invalid inputs', () => {
        expect(ShellExecutionCanceledResult.is(undefined)).to.be.false;
        // eslint-disable-next-line no-null/no-null
        expect(ShellExecutionCanceledResult.is(null)).to.be.false;
        expect(ShellExecutionCanceledResult.is({ canceled: false })).to.be.false;
        expect(ShellExecutionCanceledResult.is({ output: 'test' })).to.be.false;
    });
});
