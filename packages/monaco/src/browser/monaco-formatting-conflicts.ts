/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from '@theia/core/shared/inversify';
import { MonacoQuickOpenService } from './monaco-quick-open-service';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/common/quick-open-model';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PreferenceService, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';

type FormattingEditProvider = monaco.languages.DocumentFormattingEditProvider | monaco.languages.DocumentRangeFormattingEditProvider;

const PREFERENCE_NAME = 'editor.defaultFormatter';

@injectable()
export class MonacoFormattingConflictsContribution implements FrontendApplicationContribution {

    @inject(MonacoQuickOpenService)
    protected readonly quickOpenService: MonacoQuickOpenService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(PreferenceSchemaProvider)
    protected readonly preferenceSchema: PreferenceSchemaProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    async initialize(): Promise<void> {
        monaco.format.FormattingConflicts.setFormatterSelector(<T extends FormattingEditProvider>(
            formatters: T[], document: monaco.editor.ITextModel, mode: monaco.format.FormattingMode) =>
            this.selectFormatter(formatters, document, mode));
    }

    private async setDefaultFormatter(language: string, formatter: string): Promise<void> {
        const name = this.preferenceSchema.overridePreferenceName({
            preferenceName: PREFERENCE_NAME,
            overrideIdentifier: language
        });

        await this.preferenceService.set(name, formatter);
    }

    private getDefaultFormatter(language: string): string | undefined {
        const name = this.preferenceSchema.overridePreferenceName({
            preferenceName: PREFERENCE_NAME,
            overrideIdentifier: language
        });

        return this.preferenceService.get<string>(name);
    }

    private async selectFormatter<T extends FormattingEditProvider>(
        formatters: T[], document: monaco.editor.ITextModel, mode: monaco.format.FormattingMode): Promise<T | undefined> {

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
        const defaultFormatterId = await this.getDefaultFormatter(languageId);

        if (defaultFormatterId) {
            const formatter = formatters.find(f => f.extensionId && f.extensionId.value === defaultFormatterId);
            if (formatter) {
                return formatter;
            }
        }

        let deferred: Deferred<T> | undefined = new Deferred<T>();

        const items: QuickOpenItem[] = formatters
            .filter(formatter => formatter.displayName)
            .map<QuickOpenItem>(formatter => {
                const displayName: string = formatter.displayName!;
                const extensionId = formatter.extensionId ? formatter.extensionId.value : undefined;

                return new QuickOpenItem({
                    label: displayName,
                    detail: extensionId,
                    run: (openMode: QuickOpenMode) => {
                        if (openMode === QuickOpenMode.OPEN) {
                            if (deferred) {
                                deferred.resolve(formatter);
                                deferred = undefined;
                            }

                            this.quickOpenService.hide();

                            this.setDefaultFormatter(languageId, extensionId ? extensionId : '');
                            return true;
                        }

                        return false;
                    }
                });
            })
            .sort((a, b) => a.getLabel()!.localeCompare(b.getLabel()!));

        const model: QuickOpenModel = {
            onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                acceptor(items);
            }
        };

        this.quickOpenService.open(model,
            {
                fuzzyMatchDescription: true,
                fuzzyMatchLabel: true,
                fuzzyMatchDetail: true,
                placeholder: 'Select formatter for the current document',
                ignoreFocusOut: false,

                onClose: () => {
                    if (deferred) {
                        deferred.resolve(undefined);
                        deferred = undefined;
                    }
                }
            });

        return deferred.promise;
    }

}
