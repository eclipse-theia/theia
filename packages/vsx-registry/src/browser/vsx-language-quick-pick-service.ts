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

import { LanguageQuickPickItem, LanguageQuickPickService } from '@theia/core/lib/browser/i18n/language-quick-pick-service';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { LanguageInfo } from '@theia/core/lib/common/i18n/localization';
import { PluginServer } from '@theia/plugin-ext';
import { VSXSearchEntry } from '@theia/ovsx-client';
import { VSCodeExtensionUri } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-uri';
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ILogger } from '@theia/core';
import { VSXRegistryService } from '../common/vsx-registry-service';

@injectable()
export class VSXLanguageQuickPickService extends LanguageQuickPickService {

    @inject(VSXRegistryService)
    protected readonly vsxRegistryService: VSXRegistryService;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ILogger) @named('vsx-registry:VSXLanguageQuickPickService')
    protected readonly logger: ILogger;

    protected override async getAvailableLanguages(): Promise<LanguageQuickPickItem[]> {
        try {
            const searchResult = await this.vsxRegistryService.search({
                category: 'Language Packs',
                sortBy: 'downloadCount',
                sortOrder: 'desc',
                size: 20
            });

            const extensionLanguages = await Promise.all(
                searchResult.extensions.map(async extension => ({
                    extension,
                    languages: await this.loadExtensionLanguages(extension)
                }))
            );

            const languages = new Map<string, LanguageQuickPickItem>();

            for (const extension of extensionLanguages) {
                for (const localizationContribution of extension.languages) {
                    if (!languages.has(localizationContribution.languageId)) {
                        languages.set(localizationContribution.languageId, {
                            ...this.createLanguageQuickPickItem(localizationContribution),
                            execute: async () => {
                                const progress = await this.messageService.showProgress({
                                    text: nls.localizeByDefault('Installing {0} language support...',
                                        localizationContribution.localizedLanguageName ?? localizationContribution.languageName ?? localizationContribution.languageId),
                                });
                                try {
                                    const extensionUri = VSCodeExtensionUri.fromId(`${extension.extension.namespace}.${extension.extension.name}`).toString();
                                    await this.pluginServer.install(extensionUri);
                                } finally {
                                    progress.cancel();
                                }
                            }
                        });
                    }
                }
            }
            return Array.from(languages.values());
        } catch (error) {
            this.logger.error(error);
            return [];
        }
    }

    protected async loadExtensionLanguages(extension: VSXSearchEntry): Promise<LanguageInfo[]> {
        return this.vsxRegistryService.fetchLanguagePackInfo(extension.files.download);
    }
}
