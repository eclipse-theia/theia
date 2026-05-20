// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    extractTerminalFailureLine,
    terminalOutputNeedsInstall,
    terminalOutputPortInUse,
} from './qaap-project-bootstrap-dev-errors';

describe('qaap-project-bootstrap-dev-errors', () => {

    it('terminalOutputNeedsInstall detects missing modules', () => {
        expect(terminalOutputNeedsInstall('Cannot find package \'@foo/bar\'')).to.equal(true);
    });

    it('terminalOutputPortInUse detects EADDRINUSE', () => {
        expect(terminalOutputPortInUse('Error: listen EADDRINUSE: address already in use :::3000')).to.equal(true);
    });

    it('extractTerminalFailureLine surfaces generic Error lines', () => {
        const tail = 'some log\nError: listen ECONNREFUSED 127.0.0.1:5432\n';
        expect(extractTerminalFailureLine(tail, 'fallback')).to.match(/ECONNREFUSED/);
    });
});
