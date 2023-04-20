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

import { nls } from '@theia/core';
import { interfaces } from '@theia/core/shared/inversify';
import { LocalizationMain } from '../../common/plugin-api-rpc';
import { LanguagePackBundle, LanguagePackService } from '../../common/language-pack-service';

export class LocalizationMainImpl implements LocalizationMain {

    private readonly languagePackService: LanguagePackService;

    constructor(container: interfaces.Container) {
        this.languagePackService = container.get(LanguagePackService);
    }

    async $fetchBundle(id: string): Promise<LanguagePackBundle | undefined> {
        const bundle = await this.languagePackService.getBundle(id, nls.locale ?? nls.defaultLocale);
        return bundle;
    }
}
