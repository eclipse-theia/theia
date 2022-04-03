// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule, decorate, injectable } from 'inversify';
import { ApplicationPackage } from '@theia/application-package';
import { REQUEST_SERVICE_PATH } from '@theia/request';
import {
    bindContributionProvider, MessageService,
    CommandService, commandServicePath, messageServicePath, BackendAndFrontend, ServiceContribution, ProxyProvider, MessageServer, DefaultMessageService, NullMessageServer
} from '../common';
import { BackendApplication, BackendApplicationContribution, BackendApplicationCliContribution, BackendApplicationServer } from './backend-application';
import { CliManager, CliContribution } from './cli';
import { ApplicationServerImpl } from './application-server';
import { ApplicationServer, applicationPath } from '../common/application-protocol';
import { EnvVariablesServer, envVariablesPath } from './../common/env-variables';
import { EnvVariablesServerImpl } from './env-variables';
import { QuickPickService, quickPickServicePath } from '../common/quick-pick-service';
import { WsRequestValidator, WsRequestValidatorContribution } from './ws-request-validators';
import { KeytarService, keytarServicePath } from '../common/keytar-protocol';
import { KeytarServiceImpl } from './keytar-server';
import { ContributionFilterRegistry, ContributionFilterRegistryImpl } from '../common/contribution-filter';
import { EnvironmentUtils } from './environment-utils';
import { ProcessUtils } from './process-utils';
import { ProxyCliContribution } from './request/proxy-cli-contribution';
import { bindNodeStopwatch, bindBackendStopwatchServer } from './performance';
import { OSBackendApplicationContribution } from './os-backend-application-contribution';
import { BackendRequestFacade } from './request/backend-request-facade';

decorate(injectable(), ApplicationPackage);

const backendAndFrontendModule = new ContainerModule(bind => {
    bind(MessageService).to(DefaultMessageService).inSingletonScope();
    // #region proxies to frontend services
    bind(CommandService)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(commandServicePath))
        .inSingletonScope();
    bind(MessageServer)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(messageServicePath))
        .inSingletonScope();
    bind(QuickPickService)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(quickPickServicePath))
        .inSingletonScope();
    // #endregion
});

export const backendApplicationModule = new ContainerModule(bind => {
    bind(ContainerModule)
        .toConstantValue(backendAndFrontendModule)
        .whenTargetNamed(BackendAndFrontend);

    bind(MessageServer).toConstantValue(NullMessageServer);
    bind(MessageService).to(DefaultMessageService).inSingletonScope();

    bind(CliManager).toSelf().inSingletonScope();
    bindContributionProvider(bind, CliContribution);

    bind(BackendApplicationCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(BackendApplicationCliContribution);

    bind(BackendApplication).toSelf().inSingletonScope();
    bindContributionProvider(bind, BackendApplicationContribution);
    // Bind the BackendApplicationServer as a BackendApplicationContribution
    // and fallback to an empty contribution if never bound.
    bind(BackendApplicationContribution)
        .toDynamicValue(ctx => {
            if (ctx.container.isBound(BackendApplicationServer)) {
                return ctx.container.get(BackendApplicationServer);
            } else {
                console.warn('no BackendApplicationServer is set, frontend might not be available');
                return {};
            }
        })
        .inSingletonScope();

    bind(ApplicationServer).to(ApplicationServerImpl).inSingletonScope();

    bind(EnvVariablesServer).to(EnvVariablesServerImpl).inSingletonScope();

    bind(ApplicationPackage)
        .toDynamicValue(ctx => {
            const { projectPath } = ctx.container.get(BackendApplicationCliContribution);
            return new ApplicationPackage({ projectPath });
        })
        .inSingletonScope();

    bind(WsRequestValidator).toSelf().inSingletonScope();
    bindContributionProvider(bind, WsRequestValidatorContribution);
    bind(KeytarService).to(KeytarServiceImpl).inSingletonScope();

    bind(ContributionFilterRegistry).to(ContributionFilterRegistryImpl).inSingletonScope();

    bind(EnvironmentUtils).toSelf().inSingletonScope();
    bind(ProcessUtils).toSelf().inSingletonScope();

    bind(OSBackendApplicationContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(OSBackendApplicationContribution);

    bind(ProxyCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(ProxyCliContribution);

    bind(BackendRequestFacade).toSelf().inSingletonScope();

    bindNodeStopwatch(bind);
    bindBackendStopwatchServer(bind);

    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [applicationPath, () => ctx.container.get(ApplicationServer)],
            [envVariablesPath, () => ctx.container.get(EnvVariablesServer)],
            [keytarServicePath, () => ctx.container.get(KeytarService)],
            [REQUEST_SERVICE_PATH, () => ctx.container.get(BackendRequestFacade)]
        ))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
});
