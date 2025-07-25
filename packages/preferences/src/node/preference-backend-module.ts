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
import { bindPreferenceProviders } from './preference-bindings';
import { PreferenceStorageFactory } from '../common/abstract-resource-preference-provider';
import { PreferenceScope, URI } from '@theia/core';
import { BackendPreferenceStorage } from './backend-preference-storage';
import { JSONCEditor } from '../common/jsonc-editor';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { DiskFileSystemProvider } from '@theia/filesystem/lib/node/disk-file-system-provider';

const preferencesConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindBackendService(CliPreferencesPath, CliPreferences);
});

export default new ContainerModule(bind => {
    bind(PreferenceCliContribution).toSelf().inSingletonScope();
    bind(CliPreferences).toService(PreferenceCliContribution);
    bind(CliContribution).toService(PreferenceCliContribution);
    bind(JSONCEditor).toSelf().inSingletonScope();

    bind(PreferenceStorageFactory).toFactory(({ container }) => (uri: URI, scope: PreferenceScope) => new BackendPreferenceStorage(
        container.get(DiskFileSystemProvider),
        uri,
        container.get(EncodingService),
        container.get(JSONCEditor)
    ));

    bind(ConnectionContainerModule).toConstantValue(preferencesConnectionModule);
    bindPreferenceProviders(bind);
});
