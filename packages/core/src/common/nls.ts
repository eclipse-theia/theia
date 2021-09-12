/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
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

import { FormatType, Localization } from './i18n/localization';

export namespace nls {

    export let localization: Localization | undefined;

    export const localeId = 'localeId';

    export const locale = typeof window === 'object' && window && window.localStorage.getItem(localeId) || undefined;

    export function localize(key: string, defaultValue: string, ...args: FormatType[]): string {
        return Localization.localize(localization, key, defaultValue, ...args);
    }
}
