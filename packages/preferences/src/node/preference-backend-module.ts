// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { CliContribution } from '@theia/core/lib/node/cli';
import { PreferenceCliContribution } from './preference-cli-contribution';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { CliPreferences, CliPreferencesPath } from '../common/cli-preferences';

const preferencesConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindBackendService(CliPreferencesPath, CliPreferences);
});

export default new ContainerModule(bind => {
    bind(PreferenceCliContribution).toSelf().inSingletonScope();
    bind(CliPreferences).toService(PreferenceCliContribution);
    bind(CliContribution).toService(PreferenceCliContribution);

    bind(ConnectionContainerModule).toConstantValue(preferencesConnectionModule);
});
