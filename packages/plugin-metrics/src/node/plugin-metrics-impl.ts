/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { PluginMetrics } from '../common/metrics-protocol';

@injectable()
export class PluginMetricsImpl implements PluginMetrics {

    private metrics: string = '{}';

    // tslint:disable-next-line:typedef
    setMetrics(metrics: string) {
        this.metrics = metrics;
    }

    /**
     * This sends all the information about metrics inside of the plugins to the backend
     * where it is served on the /metrics endpoint
     */
    getMetrics(): string {
        return this.metrics;
    }

}
