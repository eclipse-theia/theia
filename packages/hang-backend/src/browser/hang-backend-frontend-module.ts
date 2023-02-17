/********************************************************************************
 * Copyright (C) 2023 Ericsson and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { HangBackendCommandContribution } from './hang-backend-command-contribution';
import { HangBackendService, HANG_BACKEND_BACKEND_SERVICE_PATH } from '../common/types';

export default new ContainerModule(bind => {
    bind(HangBackendCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(HangBackendCommandContribution);

    bind(HangBackendService)
        .toDynamicValue(
            ({ container }) => WebSocketConnectionProvider
                .createProxy<HangBackendService>(container, HANG_BACKEND_BACKEND_SERVICE_PATH),
        ).inSingletonScope();
});
