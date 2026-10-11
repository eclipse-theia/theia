// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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
import { PluginMetrics } from '../common/metrics-protocol';
import { BrowserOnlyPluginMetrics } from './browser-only-plugin-metrics';
import pluginMetricsFrontendOnlyModule from './plugin-metrics-frontend-only-module';

describe('browser-only plugin metrics', () => {
    it('binds the no-op metrics', () => {
        const container = new Container();
        container.load(pluginMetricsFrontendOnlyModule);

        const metrics = container.get<PluginMetrics>(PluginMetrics);
        expect(metrics).to.be.instanceOf(BrowserOnlyPluginMetrics);
        expect(() => metrics.setMetrics('metric 1')).not.to.throw();
        expect(metrics.getMetrics()).to.equal('');
    });

    it('replaces an existing metrics binding', () => {
        const container = new Container();
        container.bind(PluginMetrics).toConstantValue({
            setMetrics: () => { },
            getMetrics: () => 'existing'
        });
        container.load(pluginMetricsFrontendOnlyModule);

        expect(container.get(PluginMetrics)).to.be.instanceOf(BrowserOnlyPluginMetrics);
    });
});
