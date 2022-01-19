// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';

export async function loadTranslations(): Promise<void> {
    const defaultLocale = FrontendApplicationConfigProvider.get().defaultLocale;
    if (defaultLocale && !nls.locale) {
        Object.assign(nls, {
            locale: defaultLocale
        });
    }
    if (nls.locale) {
        const endpoint = new Endpoint({ path: '/i18n/' + nls.locale }).getRestUrl().toString();
        const response = await fetch(endpoint);
        nls.localization = await response.json();
    }
}
