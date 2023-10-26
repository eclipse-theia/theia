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

import { injectable } from 'inversify';
import { nls } from '../../common/nls';
import { LanguageInfo, Localization } from '../../common/i18n/localization';
import { Disposable } from '../../common/disposable';
import { isObject } from '../../common/types';

/**
 * Localization data structure that contributes its localizations asynchronously.
 * Allows to load localizations on demand when requested by the user.
 */
export interface LazyLocalization extends LanguageInfo {
    getTranslations(): Promise<Record<string, string>>;
}

export namespace LazyLocalization {
    export function is(obj: unknown): obj is LazyLocalization {
        return isObject<LazyLocalization>(obj) && typeof obj.languageId === 'string' && typeof obj.getTranslations === 'function';
    }
    export function fromLocalization(localization: Localization): LazyLocalization {
        const {
            languageId,
            languageName,
            languagePack,
            localizedLanguageName,
            translations
        } = localization;
        return {
            languageId,
            languageName,
            languagePack,
            localizedLanguageName,
            getTranslations: () => Promise.resolve(translations)
        };
    }
    export async function toLocalization(localization: LazyLocalization): Promise<Localization> {
        const {
            languageId,
            languageName,
            languagePack,
            localizedLanguageName
        } = localization;
        return {
            languageId,
            languageName,
            languagePack,
            localizedLanguageName,
            translations: await localization.getTranslations()
        };
    }
}

@injectable()
export class LocalizationProvider {

    protected localizations: LazyLocalization[] = [];
    protected currentLanguage = nls.defaultLocale;

    addLocalizations(...localizations: LazyLocalization[]): Disposable {
        this.localizations.push(...localizations);
        return Disposable.create(() => {
            for (const localization of localizations) {
                const index = this.localizations.indexOf(localization);
                if (index >= 0) {
                    this.localizations.splice(index, 1);
                }
            }
        });
    }

    setCurrentLanguage(languageId: string): void {
        this.currentLanguage = languageId;
    }

    getCurrentLanguage(): string {
        return this.currentLanguage;
    }

    getAvailableLanguages(all?: boolean): LanguageInfo[] {
        const languageInfos = new Map<string, LanguageInfo>();
        for (const localization of this.localizations.values()) {
            if (all || localization.languagePack) {
                const languageInfo = languageInfos.get(localization.languageId) ?? {
                    languageId: localization.languageId
                };
                languageInfo.languageName ||= localization.languageName;
                languageInfo.localizedLanguageName ||= localization.localizedLanguageName;
                languageInfo.languagePack ||= localization.languagePack;
                languageInfos.set(localization.languageId, languageInfo);
            }
        }
        return Array.from(languageInfos.values()).sort((a, b) => a.languageId.localeCompare(b.languageId));
    }

    async loadLocalization(languageId: string): Promise<Localization> {
        const merged: Localization = {
            languageId,
            translations: {}
        };
        const localizations = await Promise.all(this.localizations.filter(e => e.languageId === languageId).map(LazyLocalization.toLocalization));
        for (const localization of localizations) {
            merged.languageName ||= localization.languageName;
            merged.localizedLanguageName ||= localization.localizedLanguageName;
            merged.languagePack ||= localization.languagePack;
            Object.assign(merged.translations, localization.translations);
        }
        return merged;
    }

}
