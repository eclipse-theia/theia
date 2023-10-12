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

import { inject, injectable } from 'inversify';
import { nls } from '../../common/nls';
import { AsyncLocalizationProvider, LanguageInfo } from '../../common/i18n/localization';
import { QuickInputService, QuickPickItem, QuickPickSeparator } from '../quick-input';
import { WindowService } from '../window/window-service';

export interface LanguageQuickPickItem extends QuickPickItem, LanguageInfo {
    execute?(): Promise<void>
}

@injectable()
export class LanguageQuickPickService {

    @inject(QuickInputService) protected readonly quickInputService: QuickInputService;
    @inject(AsyncLocalizationProvider) protected readonly localizationProvider: AsyncLocalizationProvider;
    @inject(WindowService) protected readonly windowService: WindowService;

    async pickDisplayLanguage(): Promise<LanguageInfo | undefined> {
        const quickInput = this.quickInputService.createQuickPick<LanguageQuickPickItem>();
        const installedItems = await this.getInstalledLanguages();
        const quickInputItems: (LanguageQuickPickItem | QuickPickSeparator)[] = [
            {
                type: 'separator',
                label: nls.localizeByDefault('Installed')
            },
            ...installedItems
        ];
        quickInput.items = quickInputItems;
        quickInput.busy = true;
        const selected = installedItems.find(item => nls.isSelectedLocale(item.languageId));
        if (selected) {
            quickInput.activeItems = [selected];
        }
        quickInput.placeholder = nls.localizeByDefault('Configure Display Language');
        quickInput.show();

        this.getAvailableLanguages().then(availableItems => {
            if (availableItems.length > 0) {
                quickInputItems.push({
                    type: 'separator',
                    label: nls.localizeByDefault('Available')
                });
                const installed = new Set(installedItems.map(e => e.languageId));
                for (const available of availableItems) {
                    // Exclude already installed languages
                    if (!installed.has(available.languageId)) {
                        quickInputItems.push(available);
                    }
                }
                quickInput.items = quickInputItems;
            }
        }).finally(() => {
            quickInput.busy = false;
        });

        return new Promise(resolve => {
            quickInput.onDidAccept(async () => {
                const selectedItem = quickInput.selectedItems[0];
                if (selectedItem) {
                    // Some language quick pick items want to install additional languages
                    // We have to await that before returning the selected locale
                    await selectedItem.execute?.();
                    resolve(selectedItem);
                } else {
                    resolve(undefined);
                }
                quickInput.hide();
            });
            quickInput.onDidHide(() => {
                resolve(undefined);
            });
        });
    }

    protected async getInstalledLanguages(): Promise<LanguageQuickPickItem[]> {
        const languageInfos = await this.localizationProvider.getAvailableLanguages();
        const items: LanguageQuickPickItem[] = [];
        const en: LanguageInfo = {
            languageId: 'en',
            languageName: 'English',
            localizedLanguageName: 'English'
        };
        languageInfos.push(en);
        for (const language of languageInfos.filter(e => !!e.languageId)) {
            items.push(this.createLanguageQuickPickItem(language));
        }
        return items;
    }

    protected async getAvailableLanguages(): Promise<LanguageQuickPickItem[]> {
        return [];
    }

    protected createLanguageQuickPickItem(language: LanguageInfo): LanguageQuickPickItem {
        let label: string;
        let description: string | undefined;
        const languageName = language.localizedLanguageName || language.languageName;
        const id = language.languageId;
        const idLabel = id + (nls.isSelectedLocale(id) ? ` (${nls.localizeByDefault('Current')})` : '');
        if (languageName) {
            label = languageName;
            description = idLabel;
        } else {
            label = idLabel;
        }
        return {
            label,
            description,
            languageId: id,
            languageName: language.languageName,
            localizedLanguageName: language.localizedLanguageName
        };
    }
}
