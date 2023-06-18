// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
import { bindContributionProvider } from '../../common';
import { CoreCopyContribution } from './core-copy-contribution';
import { RemoteCopyContribution, RemoteCopyRegistry } from './remote-copy-contribution';
import { RemoteNativeDependencyContribution } from './remote-native-dependency-contribution';
import { AppNativeDependencyContribution } from './app-native-dependency-contribution';
import { BackendRemoteService } from './backend-remote-service';

export default new ContainerModule(bind => {
    bind(BackendRemoteService).toSelf().inSingletonScope();
    bindContributionProvider(bind, RemoteCopyContribution);
    bind(RemoteCopyRegistry).toSelf().inSingletonScope();
    bind(CoreCopyContribution).toSelf().inSingletonScope();
    bind(RemoteCopyContribution).toService(CoreCopyContribution);

    bindContributionProvider(bind, RemoteNativeDependencyContribution);
    bind(AppNativeDependencyContribution).toSelf().inSingletonScope();
    bind(RemoteNativeDependencyContribution).toService(AppNativeDependencyContribution);
});
