// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    extractDevOutputProbePorts,
    extractTerminalFailureLine,
    terminalOutputNeedsInstall,
    terminalOutputNextDevLock,
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

    it('terminalOutputNextDevLock detects Next dev lock errors', () => {
        expect(terminalOutputNextDevLock('Unable to acquire lock at .next/dev/lock')).to.equal(true);
    });

    it('extractDevOutputProbePorts reads alternate port and Local URL', () => {
        const tail = 'using available port 3001 instead.\n- Local: http://localhost:3001\n';
        expect(extractDevOutputProbePorts(tail)).to.deep.equal([3001]);
    });

    it('extractTerminalFailureLine explains Next lock with preview hint', () => {
        const tail = 'using available port 3001 instead.\nUnable to acquire lock\n';
        expect(extractTerminalFailureLine(tail, 'fallback')).to.contain('Next.js is already running');
        expect(extractTerminalFailureLine(tail, 'fallback')).to.contain('3001');
    });
});
