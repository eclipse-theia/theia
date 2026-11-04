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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from 'inversify';
import { LocalizationContribution, LocalizationRegistry } from './localization-contribution.js';

@injectable()
export class TheiaLocalizationContribution implements LocalizationContribution {
    async registerLocalizations(registry: LocalizationRegistry): Promise<void> {
        // Attempt to use the same languages as VS Code
        // See https://code.visualstudio.com/docs/getstarted/locales#_available-locales
        registry.registerLocalizationFromRequire('zh-cn', (await import('../../../i18n/nls.zh-cn.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('zh-tw', (await import('../../../i18n/nls.zh-tw.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('fr', (await import('../../../i18n/nls.fr.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('de', (await import('../../../i18n/nls.de.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('it', (await import('../../../i18n/nls.it.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('es', (await import('../../../i18n/nls.es.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('ja', (await import('../../../i18n/nls.ja.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('ko', (await import('../../../i18n/nls.ko.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('ru', (await import('../../../i18n/nls.ru.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('pt-br', (await import('../../../i18n/nls.pt-br.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('tr', (await import('../../../i18n/nls.tr.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('pl', (await import('../../../i18n/nls.pl.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('cs', (await import('../../../i18n/nls.cs.json', { with: { type: 'json' } })).default);
        registry.registerLocalizationFromRequire('hu', (await import('../../../i18n/nls.hu.json', { with: { type: 'json' } })).default);
    }
}
