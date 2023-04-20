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

import * as express from 'express';
import { inject, injectable } from 'inversify';
import { nls } from '../../common/nls';
import { Deferred } from '../../common/promise-util';
import { BackendApplicationContribution } from '../backend-application';
import { LocalizationRegistry } from './localization-contribution';
import { LocalizationProvider } from './localization-provider';

@injectable()
export class LocalizationBackendContribution implements BackendApplicationContribution {
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

    configure(app: express.Application): void {
        app.get('/i18n/:locale', async (req, res) => {
            await this.waitForInitialization();
            let locale = req.params.locale;
            locale = this.localizationProvider.getAvailableLanguages().some(e => e.languageId === locale) ? locale : nls.defaultLocale;
            this.localizationProvider.setCurrentLanguage(locale);
            res.send(this.localizationProvider.loadLocalization(locale));
        });
    }
}
