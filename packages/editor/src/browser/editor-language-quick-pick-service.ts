// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Language, LanguageService } from '@theia/core/lib/browser/language-service';
import { nls, QuickInputService, QuickPickItemOrSeparator, QuickPickValue, URI } from '@theia/core';
import { LabelProvider } from '@theia/core/lib/browser';

@injectable()
export class EditorLanguageQuickPickService {
    @inject(LanguageService)
    protected readonly languages: LanguageService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    async pickEditorLanguage(current: string): Promise<QuickPickValue<'autoDetect' | Language> | undefined> {
        const items: Array<QuickPickValue<'autoDetect' | Language> | QuickPickItemOrSeparator> = [
            { label: nls.localizeByDefault('Auto Detect'), value: 'autoDetect' },
            { type: 'separator', label: nls.localizeByDefault('languages (identifier)') },
            ... (this.languages.languages.map(language => this.toQuickPickLanguage(language, current))).sort((e, e2) => e.label.localeCompare(e2.label))
        ];
        const selectedMode = await this.quickInputService?.showQuickPick(items, { placeholder: nls.localizeByDefault('Select Language Mode') });
        return (selectedMode && 'value' in selectedMode) ? selectedMode : undefined;
    }

    protected toQuickPickLanguage(value: Language, current: string): QuickPickValue<Language> {
        const languageUri = this.toLanguageUri(value);
        const icon = this.labelProvider.getIcon(languageUri);
        const iconClasses = icon !== '' ? [icon + ' file-icon'] : undefined;
        const configured = current === value.id;
        return {
            value,
            label: value.name,
            description: nls.localizeByDefault(`({0})${configured ? ' - Configured Language' : ''}`, value.id),
            iconClasses
        };
    }

    protected toLanguageUri(language: Language): URI {
        const extension = language.extensions.values().next();
        if (extension.value) {
            return new URI('file:///' + extension.value);
        }
        const filename = language.filenames.values().next();
        if (filename.value) {
            return new URI('file:///' + filename.value);
        }
        return new URI('file:///.txt');
    }

}
