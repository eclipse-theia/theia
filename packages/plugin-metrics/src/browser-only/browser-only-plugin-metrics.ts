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

import { injectable } from '@theia/core/shared/inversify';
import { PluginMetrics } from '../common/metrics-protocol';

/**
 * Browser-only apps have no backend to expose metrics, so they are dropped. The `frontend` module
 * isn't loaded there, so this binding is what keeps `PluginMetrics` injectable.
 */
@injectable()
export class BrowserOnlyPluginMetrics implements PluginMetrics {

    setMetrics(_metrics: string): void { }

    getMetrics(): string {
        return '';
    }
}
