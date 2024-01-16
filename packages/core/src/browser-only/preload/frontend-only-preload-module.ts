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
import { LocalizationServer } from '../../common/i18n/localization-server';
import { OS, OSBackendProvider } from '../../common/os';
import { Localization } from '../../common/i18n/localization';

// loaded after regular preload module
export default new ContainerModule((bind, unbind, isBound, rebind) => {
    const frontendOnlyLocalizationServer: LocalizationServer = {
        loadLocalization: async (languageId: string): Promise<Localization> => ({ translations: {}, languageId })
    };
    if (isBound(LocalizationServer)) {
        rebind(LocalizationServer).toConstantValue(frontendOnlyLocalizationServer);
    } else {
        bind(LocalizationServer).toConstantValue(frontendOnlyLocalizationServer);
    }

    const frontendOnlyOSBackendProvider: OSBackendProvider = {
        getBackendOS: async (): Promise<OS.Type> => {
            if (window.navigator.platform.startsWith('Win')) {
                return OS.Type.Windows;
            } else if (window.navigator.platform.startsWith('Mac')) {
                return OS.Type.OSX;
            } else {
                return OS.Type.Linux;
            }
        }
    };
    if (isBound(OSBackendProvider)) {
        rebind(OSBackendProvider).toConstantValue(frontendOnlyOSBackendProvider);
    } else {
        bind(OSBackendProvider).toConstantValue(frontendOnlyOSBackendProvider);
    }
});
