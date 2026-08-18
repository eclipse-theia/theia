// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import { TelemetryService } from '../common/telemetry-service';
import { BrowserOnlyTelemetryService } from './browser-only-telemetry-service';
import telemetryFrontendOnlyModule from './telemetry-frontend-only-module';

describe('browser-only telemetry service', () => {
    it('binds the no-op service when telemetry is not already bound', () => {
        const container = new Container();
        container.load(telemetryFrontendOnlyModule);

        const service = container.get<TelemetryService>(TelemetryService);
        expect(service).to.be.instanceOf(BrowserOnlyTelemetryService);
        expect(() => service.report('invalid', { malformed: { nested: true } } as never)).not.to.throw();
    });

    it('replaces an existing telemetry service without invoking it', () => {
        const container = new Container();
        let reports = 0;
        container.bind(TelemetryService).toConstantValue({ report: () => reports++ });
        container.load(telemetryFrontendOnlyModule);

        const service = container.get<TelemetryService>(TelemetryService);
        service.report('company/action');
        expect(service).to.be.instanceOf(BrowserOnlyTelemetryService);
        expect(reports).to.equal(0);
    });
});
