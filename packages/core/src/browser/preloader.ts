// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { nls } from '../common/nls';
import { Endpoint } from './endpoint';
import { OS } from '../common/os';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';

function fetchFrom(path: string): Promise<Response> {
    const endpoint = new Endpoint({ path }).getRestUrl().toString();
    return fetch(endpoint);
}

async function loadTranslations(): Promise<void> {
    const defaultLocale = FrontendApplicationConfigProvider.get().defaultLocale;
    if (defaultLocale && !nls.locale) {
        Object.assign(nls, {
            locale: defaultLocale
        });
    }
    if (nls.locale) {
        const response = await fetchFrom(`/i18n/${nls.locale}`);
        nls.localization = await response.json();
    }
}

async function loadBackendOS(): Promise<void> {
    const response = await fetchFrom('/os');
    const osType = await response.text() as OS.Type;
    const isWindows = osType === 'Windows';
    const isOSX = osType === 'OSX';
    OS.backend.isOSX = isOSX;
    OS.backend.isWindows = isWindows;
    OS.backend.type = () => osType;
}

export async function preload(): Promise<void> {
    await Promise.allSettled([
        loadTranslations(),
        loadBackendOS()
    ]);
}
