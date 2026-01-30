// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, PreferenceLanguageOverrideService, PreferenceScope, PreferenceService } from '@theia/core';
import { FormatterInfo, FormatterService, FormatterSettingScope, FormatterStatus } from '@theia/editor/lib/browser/editor-formatter-service';
import { TextEditor } from '@theia/editor/lib/browser';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ExtensionIdentifier } from '@theia/monaco-editor-core/esm/vs/platform/extensions/common/extensions';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { MonacoEditor } from './monaco-editor';

/**
 * Extended formatter provider interface that includes extension metadata.
 * These properties are added by Theia when registering formatters from plugins.
 */
export interface FormattingEditProviderWithMetadata {
    extensionId?: ExtensionIdentifier;
    displayName?: string;
}

export type DocumentFormattingEditProviderWithMetadata = DocumentFormattingEditProvider & FormattingEditProviderWithMetadata;
export type DocumentRangeFormattingEditProviderWithMetadata = DocumentRangeFormattingEditProvider & FormattingEditProviderWithMetadata;

function hasFormatterMetadata(formatter: DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider): formatter is
    (DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider) & Required<FormattingEditProviderWithMetadata> {
    const provider = formatter as FormattingEditProviderWithMetadata;
    return provider.extensionId !== undefined && provider.displayName !== undefined;
}

const PREFERENCE_NAME = 'editor.defaultFormatter';

@injectable()
export class MonacoFormatterService implements FormatterService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(PreferenceLanguageOverrideService)
    protected readonly preferenceSchema: PreferenceLanguageOverrideService;

    protected readonly onDidChangeFormattersEmitter = new Emitter<void>();
    readonly onDidChangeFormatters: Event<void> = this.onDidChangeFormattersEmitter.event;

    @postConstruct()
    protected init(): void {
        const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);

        languageFeaturesService.documentFormattingEditProvider.onDidChange(() => {
            this.onDidChangeFormattersEmitter.fire();
        });

        languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(() => {
            this.onDidChangeFormattersEmitter.fire();
        });

        this.preferenceService.onPreferenceChanged(change => {
            if (change.preferenceName.includes(PREFERENCE_NAME)) {
                this.onDidChangeFormattersEmitter.fire();
            }
        });
    }

    protected getFormatterPreferenceName(languageId: string): string {
        return this.preferenceSchema.overridePreferenceName({
            preferenceName: PREFERENCE_NAME,
            overrideIdentifier: languageId
        });
    }

    getFormatterStatus(editor: TextEditor): FormatterStatus {
        const { languageId, uri: resourceUri } = editor.document;
        const formatters = this.getAvailableFormatters(editor);
        const preferenceName = this.getFormatterPreferenceName(languageId);

        const configuredStatus = this.getConfiguredFormatterStatus(preferenceName, resourceUri, formatters);
        if (configuredStatus) {
            return configuredStatus;
        }

        if (formatters.length === 1) {
            return {
                formatter: formatters[0],
                scope: 'auto',
                isInvalid: false,
                configuredFormatterId: undefined
            };
        }

        return {
            formatter: undefined,
            scope: 'none',
            isInvalid: false,
            configuredFormatterId: undefined
        };
    }

    protected getConfiguredFormatterStatus(
        preferenceName: string,
        resourceUri: string,
        formatters: FormatterInfo[]
    ): FormatterStatus | undefined {
        const inspection = this.preferenceService.inspect<string>(preferenceName, resourceUri);
        if (!inspection) {
            return undefined;
        }

        const configuredFormatterId = inspection.workspaceFolderValue ?? inspection.workspaceValue ?? inspection.globalValue;
        if (configuredFormatterId === undefined) {
            return undefined;
        }

        let scope: FormatterSettingScope;
        if (inspection.workspaceFolderValue !== undefined) {
            scope = 'folder';
        } else if (inspection.workspaceValue !== undefined) {
            scope = 'workspace';
        } else {
            scope = 'user';
        }
        const formatter = formatters.find(f => f.id === configuredFormatterId);

        return {
            formatter,
            scope,
            isInvalid: formatter === undefined,
            configuredFormatterId
        };
    }

    getAvailableFormatters(editor: TextEditor): FormatterInfo[] {
        const model = this.getEditorModel(editor);
        if (!model) {
            return [];
        }

        const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
        const documentFormatters = languageFeaturesService.documentFormattingEditProvider.ordered(model);
        const rangeFormatters = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);

        return this.extractUniqueFormatters([...documentFormatters, ...rangeFormatters]);
    }

    protected getEditorModel(editor: TextEditor): ITextModel | undefined {
        if (editor instanceof MonacoEditor) {
            // Cast is needed because getModel() returns the API ITextModel type
            // which differs from the internal ITextModel type we import
            return editor.getControl().getModel() as unknown as ITextModel | undefined;
        }
        return undefined;
    }

    protected extractUniqueFormatters(
        formatters: Array<DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider>
    ): FormatterInfo[] {
        const formatterMap = new Map<string, FormatterInfo>();

        for (const formatter of formatters) {
            if (hasFormatterMetadata(formatter)) {
                const id = formatter.extensionId.value;
                if (!formatterMap.has(id)) {
                    formatterMap.set(id, {
                        id,
                        displayName: formatter.displayName
                    });
                }
            }
        }

        return Array.from(formatterMap.values());
    }

    async setDefaultFormatter(languageIdOrEditor: string | TextEditor, formatterId: string | undefined, scope: PreferenceScope): Promise<void> {
        const isEditor = typeof languageIdOrEditor !== 'string';
        const languageId = isEditor ? languageIdOrEditor.document.languageId : languageIdOrEditor;
        const resourceUri = isEditor ? languageIdOrEditor.document.uri : undefined;
        const preferenceName = this.getFormatterPreferenceName(languageId);
        await this.preferenceService.set(preferenceName, formatterId, scope, resourceUri);
    }

    getDefaultFormatter(languageId: string, resourceUri: string): string | undefined {
        const preferenceName = this.getFormatterPreferenceName(languageId);
        return this.preferenceService.get<string>(preferenceName, undefined, resourceUri);
    }

    getConfiguredScope(editor: TextEditor): PreferenceScope | undefined {
        const { languageId, uri: resourceUri } = editor.document;
        const preferenceName = this.getFormatterPreferenceName(languageId);
        const inspection = this.preferenceService.inspect<string>(preferenceName, resourceUri);

        if (!inspection) {
            return undefined;
        }

        if (inspection.workspaceFolderValue !== undefined) {
            return PreferenceScope.Folder;
        }
        if (inspection.workspaceValue !== undefined) {
            return PreferenceScope.Workspace;
        }
        if (inspection.globalValue !== undefined) {
            return PreferenceScope.User;
        }
        return undefined;
    }
}
