// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoQuickInputService } from './monaco-quick-input-service';
import * as monaco from '@theia/monaco-editor-core';
import { FormattingConflicts, FormattingMode } from '@theia/monaco-editor-core/esm/vs/editor/contrib/format/browser/format';
import { DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { nls, PreferenceScope } from '@theia/core';
import { MonacoFormatterService } from './monaco-formatter-service';

type FormattingEditProvider = DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider;

@injectable()
export class MonacoFormattingConflictsContribution implements FrontendApplicationContribution {

    @inject(MonacoQuickInputService)
    protected readonly monacoQuickInputService: MonacoQuickInputService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MonacoFormatterService)
    protected readonly formatterService: MonacoFormatterService;

    async initialize(): Promise<void> {
        FormattingConflicts.setFormatterSelector(<T extends FormattingEditProvider>(
            formatters: T[], document: ITextModel, mode: FormattingMode) =>
            this.selectFormatter(formatters, document, mode));
    }

    private async selectFormatter<T extends FormattingEditProvider>(
        formatters: T[], document: monaco.editor.ITextModel | ITextModel, mode: FormattingMode): Promise<T | undefined> {

        if (formatters.length === 0) {
            return undefined;
        }

        if (formatters.length === 1) {
            return formatters[0];
        }

        const currentEditor = this.editorManager.currentEditor;
        if (!currentEditor) {
            return undefined;
        }

        const languageId = currentEditor.editor.document.languageId;
        const defaultFormatterId = this.formatterService.getDefaultFormatter(languageId, document.uri.toString());

        if (defaultFormatterId) {
            const formatter = formatters.find(f => f.extensionId && f.extensionId.value === defaultFormatterId);
            if (formatter) {
                return formatter;
            }
        }

        return new Promise<T | undefined>(async (resolve, reject) => {
            const items = formatters
                .filter(formatter => formatter.displayName)
                .map(formatter => ({
                    label: formatter.displayName!,
                    detail: formatter.extensionId ? formatter.extensionId.value : undefined,
                    value: formatter,
                }))
                .sort((a, b) => a.label!.localeCompare(b.label!));

            const selectedFormatter = await this.monacoQuickInputService.showQuickPick(items, { placeholder: nls.localizeByDefault('Format Document With...') });
            if (selectedFormatter) {
                this.formatterService.setDefaultFormatter(languageId, selectedFormatter.detail, PreferenceScope.Workspace);
                resolve(selectedFormatter.value);
            } else {
                resolve(undefined);
            }
        });
    }
}
