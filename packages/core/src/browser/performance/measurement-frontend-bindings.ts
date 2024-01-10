/********************************************************************************
* Copyright (c) 2021 STMicroelectronics and others.
*
* This program and the accompanying materials are made available under the
* terms of the Eclipse Public License 2.0 which is available at
* http://www.eclipse.org/legal/epl-2.0.
*
* This Source Code may also be made available under the following Secondary
* Licenses when the conditions for such availability set forth in the Eclipse
* Public License v. 2.0 are satisfied: GNU General Public License, version 2
* with the GNU Classpath Exception which is available at
* https://www.gnu.org/software/classpath/license.html.
*
* SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
*******************************************************************************/

import { interfaces } from 'inversify';
import { BackendStopwatch, Stopwatch, stopwatchPath } from '../../common';
import { WebSocketConnectionProvider } from '../messaging';
import { FrontendStopwatch } from './frontend-stopwatch';

export function bindFrontendStopwatch(bind: interfaces.Bind): interfaces.BindingWhenOnSyntax<Stopwatch> {
    return bind(Stopwatch).to(FrontendStopwatch).inSingletonScope();
}

export function bindBackendStopwatch(bind: interfaces.Bind): interfaces.BindingWhenOnSyntax<unknown> {
    return bind(BackendStopwatch).toDynamicValue(({ container }) => {
        const connection = container.get(WebSocketConnectionProvider);
        return connection.createProxy<BackendStopwatch>(stopwatchPath);
    }).inSingletonScope();
}
