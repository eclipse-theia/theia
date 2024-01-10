// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { ContainerModule } from 'inversify';
import { localizationPath } from '../../common/i18n/localization';
import { LocalizationProvider } from './localization-provider';
import { ConnectionHandler, RpcConnectionHandler, bindContributionProvider } from '../../common';
import { LocalizationRegistry, LocalizationContribution } from './localization-contribution';
import { LocalizationServerImpl } from './localization-server';
import { TheiaLocalizationContribution } from './theia-localization-contribution';
import { LocalizationServer, LocalizationServerPath } from '../../common/i18n/localization-server';
import { BackendApplicationContribution } from '../backend-application';

export default new ContainerModule(bind => {
    bind(LocalizationProvider).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(localizationPath, () => ctx.container.get(LocalizationProvider))
    ).inSingletonScope();
    bind(LocalizationRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, LocalizationContribution);
    bind(LocalizationServerImpl).toSelf().inSingletonScope();
    bind(LocalizationServer).toService(LocalizationServerImpl);
    bind(BackendApplicationContribution).toService(LocalizationServerImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(LocalizationServerPath, () => ctx.container.get(LocalizationServer))
    ).inSingletonScope();
    bind(TheiaLocalizationContribution).toSelf().inSingletonScope();
    bind(LocalizationContribution).toService(TheiaLocalizationContribution);
});
