// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { BackendApplicationContribution } from '../../node';
import { WsRequestValidatorContribution } from '../../node/ws-request-validators';
import { ElectronTokenBackendContribution } from './electron-token-backend-contribution';
import { ElectronTokenValidator } from './electron-token-validator';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(ElectronTokenBackendContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(ElectronTokenBackendContribution);
    bind(ElectronTokenValidator).toSelf().inSingletonScope();
    bind(WsRequestValidatorContribution).toService(ElectronTokenValidator);
});
