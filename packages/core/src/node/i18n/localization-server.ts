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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { Localization } from '../../common/i18n/localization.js';
import { LocalizationServer } from '../../common/i18n/localization-server.js';
import { nls } from '../../common/nls.js';
import { Deferred } from '../../common/promise-util.js';
import { BackendApplicationContribution } from '../backend-application.js';
import { LocalizationRegistry } from './localization-contribution.js';
import { LocalizationProvider } from './localization-provider.js';

@injectable()
export class LocalizationServerImpl implements LocalizationServer, BackendApplicationContribution {

    protected readonly initialized = new Deferred<void>();

    @inject(LocalizationRegistry)
    protected readonly localizationRegistry: LocalizationRegistry;

    @inject(LocalizationProvider)
    protected readonly localizationProvider: LocalizationProvider;

    async initialize(): Promise<void> {
        await this.localizationRegistry.initialize();
        this.initialized.resolve();
    }

    waitForInitialization(): Promise<void> {
        return this.initialized.promise;
    }

    async loadLocalization(languageId: string): Promise<Localization> {
        await this.waitForInitialization();
        languageId = this.localizationProvider.getAvailableLanguages().some(e => e.languageId === languageId) ? languageId : nls.defaultLocale;
        this.localizationProvider.setCurrentLanguage(languageId);
        return this.localizationProvider.loadLocalization(languageId);
    }
}
