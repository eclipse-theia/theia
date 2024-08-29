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
import { LocalizationContribution, LocalizationRegistry } from './localization-contribution';

@injectable()
export class TheiaLocalizationContribution implements LocalizationContribution {
    async registerLocalizations(registry: LocalizationRegistry): Promise<void> {
        // Attempt to use the same languages as VS Code
        // See https://code.visualstudio.com/docs/getstarted/locales#_available-locales
        registry.registerLocalizationFromRequire('zh-cn', require('../../../i18n/nls.zh-cn.json'));
        registry.registerLocalizationFromRequire('zh-tw', require('../../../i18n/nls.zh-tw.json'));
        registry.registerLocalizationFromRequire('fr', require('../../../i18n/nls.fr.json'));
        registry.registerLocalizationFromRequire('de', require('../../../i18n/nls.de.json'));
        registry.registerLocalizationFromRequire('it', require('../../../i18n/nls.it.json'));
        registry.registerLocalizationFromRequire('es', require('../../../i18n/nls.es.json'));
        registry.registerLocalizationFromRequire('ja', require('../../../i18n/nls.ja.json'));
        registry.registerLocalizationFromRequire('ko', require('../../../i18n/nls.ko.json'));
        registry.registerLocalizationFromRequire('ru', require('../../../i18n/nls.ru.json'));
        registry.registerLocalizationFromRequire('pt-br', require('../../../i18n/nls.pt-br.json'));
        registry.registerLocalizationFromRequire('tr', require('../../../i18n/nls.tr.json'));
        registry.registerLocalizationFromRequire('pl', require('../../../i18n/nls.pl.json'));
        registry.registerLocalizationFromRequire('cs', require('../../../i18n/nls.cs.json'));
        registry.registerLocalizationFromRequire('hu', require('../../../i18n/nls.hu.json'));
    }
}
