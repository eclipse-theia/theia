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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { LanguagePackBundle, LanguagePackService } from '../../common/language-pack-service';

@injectable()
export class PluginLanguagePackService implements LanguagePackService {

    protected readonly storage = new Map<string, Map<string, LanguagePackBundle>>();

    storeBundle(pluginId: string, locale: string, bundle: LanguagePackBundle): void {
        if (!this.storage.has(pluginId)) {
            this.storage.set(pluginId, new Map());
        }
        this.storage.get(pluginId)!.set(locale, bundle);
    }

    deleteBundle(pluginId: string, locale?: string): void {
        if (locale) {
            this.storage.get(pluginId)?.delete(locale);
        } else {
            this.storage.delete(pluginId);
        }
    }

    async getBundle(pluginId: string, locale: string): Promise<LanguagePackBundle | undefined> {
        return this.storage.get(pluginId)?.get(locale);
    }
}
