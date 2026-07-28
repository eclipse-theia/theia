// *****************************************************************************
// Copyright (C) 2026 suzunn and others.
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

import * as chai from 'chai';
import { TelemetryExtImpl } from './telemetry-ext';

const expect = chai.expect;

describe('TelemetryLogger', () => {
    const sender = {
        sendEventData: () => { },
        sendErrorData: () => { }
    };

    it('reflects the current telemetry enabled state', () => {
        const telemetry = new TelemetryExtImpl();
        const logger = telemetry.createTelemetryLogger(sender);

        expect(logger.telemetryEnabled).to.equal(false);
        expect(logger.isUsageEnabled).to.equal(false);
        expect(logger.isErrorsEnabled).to.equal(false);

        telemetry.isTelemetryEnabled = true;

        expect(logger.telemetryEnabled).to.equal(true);
        expect(logger.isUsageEnabled).to.equal(true);
        expect(logger.isErrorsEnabled).to.equal(true);

        telemetry.isTelemetryEnabled = false;

        expect(logger.telemetryEnabled).to.equal(false);
        expect(logger.isUsageEnabled).to.equal(false);
        expect(logger.isErrorsEnabled).to.equal(false);
    });

    it('emits enable-state changes when telemetry is toggled', () => {
        const telemetry = new TelemetryExtImpl();
        const logger = telemetry.createTelemetryLogger(sender);
        let changes = 0;

        logger.onDidChangeEnableStates(() => changes++);

        telemetry.isTelemetryEnabled = true;
        telemetry.isTelemetryEnabled = false;

        expect(changes).to.equal(2);
    });
});
