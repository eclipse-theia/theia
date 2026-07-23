// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// http://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AnalyticsSink } from '@theia/analytics/lib/node';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ConsoleAnalyticsSink } from './console-analytics-sink';

export default new ContainerModule(bind => {
    bind(ConsoleAnalyticsSink).toSelf().inSingletonScope();
    bind(AnalyticsSink).toService(ConsoleAnalyticsSink);
});
