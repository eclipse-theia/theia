/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import uuid = require('uuid');
import { ContainerModule } from 'inversify';
import { MessagingContribution } from '../../node/messaging/messaging-contribution';
import { ElectronSecurityToken } from '../../electron-common/electron-token';
import { ElectronMessagingContribution, ElectronTokenBackendContribution } from './electron-token-backend-contribution';
import { BackendApplicationContribution, MessagingService } from '../../node';
import { ElectronTokenValidator } from './electron-token-validator';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind<BackendApplicationContribution>(BackendApplicationContribution).to(ElectronTokenBackendContribution).inSingletonScope();
    bind<ElectronTokenValidator>(ElectronTokenValidator).toSelf().inSingletonScope();
    bind<ElectronSecurityToken>(ElectronSecurityToken).toConstantValue({
        value: uuid.v4(), // should change on each run.
    });
    rebind<MessagingContribution>(MessagingService.Identifier).to(ElectronMessagingContribution).inSingletonScope();
});
