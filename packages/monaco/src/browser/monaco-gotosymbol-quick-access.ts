// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input';
import { injectable } from '@theia/core/shared/inversify';
import { ICodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { IOutlineModelService } from '@theia/monaco-editor-core/esm/vs/editor/contrib/documentSymbols/browser/outlineModel';
import { StandaloneGotoSymbolQuickAccessProvider } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess';
import { IQuickAccessRegistry, Extensions } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickAccess';
import { Registry } from '@theia/monaco-editor-core/esm/vs/platform/registry/common/platform';

export class GotoSymbolQuickAccess extends StandaloneGotoSymbolQuickAccessProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...services: any[]);
    constructor(
        @ICodeEditorService protected readonly codeEditorService: ICodeEditorService,
        @ILanguageFeaturesService protected readonly languageFeatures: ILanguageFeaturesService,
        @IOutlineModelService protected readonly outlineService: IOutlineModelService,
    ) {
        super(codeEditorService, languageFeatures, outlineService);
    }

    override get activeTextEditorControl(): ICodeEditor | undefined {
        return (this.codeEditorService.getFocusedCodeEditor() ?? this.codeEditorService.getActiveCodeEditor()) ?? undefined;
    }
}

@injectable()
export class GotoSymbolQuickAccessContribution implements QuickAccessContribution {
    registerQuickAccessProvider(): void {
        Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
            ctor: GotoSymbolQuickAccess,
            prefix: '@',
            placeholder: '',
            helpEntries: [{ description: 'Go to symbol' }]
        });
    }
}
