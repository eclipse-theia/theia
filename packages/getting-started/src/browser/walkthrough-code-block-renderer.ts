// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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

import { EditorMarkdownCodeBlockRenderer } from '@theia/monaco-editor-core/esm/vs/editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer';
import { TokenizationRegistry } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ILanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/languages/language';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { IMarkdownRendererService } from '@theia/monaco-editor-core/esm/vs/platform/markdown/browser/markdownRenderer';

let configuredMarkdownRenderer: IMarkdownRendererService | undefined;
let configuredCodeBlockRenderer: EditorMarkdownCodeBlockRenderer | undefined;

/**
 * Configures monaco's application-owned code-block renderer so fenced Markdown is tokenized with installed language contributions.
 */
export async function renderWalkthroughCodeBlock(languageAlias: string | undefined, value: string): Promise<HTMLElement> {
    const codeBlockRenderer = getMonacoCodeBlockRenderer();
    const languageService = StandaloneServices.get(ILanguageService);
    const languageId = languageAlias && languageService.getLanguageIdByLanguageName(languageAlias);
    if (languageId && languageService.isRegisteredLanguageId(languageId)) {
        // Code blocks do not own a model, so explicitly trigger the same language activation Monaco performs
        // for editor models before asking the renderer to tokenize the block.
        languageService.requestRichLanguageFeatures(languageId);
        await waitForTokenization(languageId);
    }
    return codeBlockRenderer.renderCodeBlock(languageAlias, value, {});
}

function getMonacoCodeBlockRenderer(): EditorMarkdownCodeBlockRenderer {
    const markdownRenderer = StandaloneServices.get(IMarkdownRendererService);
    if (markdownRenderer === configuredMarkdownRenderer && configuredCodeBlockRenderer) {
        return configuredCodeBlockRenderer;
    }
    const instantiationService = StandaloneServices.get(IInstantiationService);
    const codeBlockRenderer = instantiationService.createInstance(EditorMarkdownCodeBlockRenderer);
    markdownRenderer.setDefaultCodeBlockRenderer(codeBlockRenderer);
    configuredMarkdownRenderer = markdownRenderer;
    configuredCodeBlockRenderer = codeBlockRenderer;
    return codeBlockRenderer;
}

function waitForTokenization(languageId: string): Promise<void> {
    if (TokenizationRegistry.get(languageId)) {
        return Promise.resolve();
    }
    return new Promise(resolve => {
        const listener = TokenizationRegistry.onDidChange(event => {
            if (event.changedLanguages.includes(languageId)) {
                finish();
            }
        });
        const timeout = window.setTimeout(finish, 1000);
        function finish(): void {
            listener.dispose();
            window.clearTimeout(timeout);
            resolve();
        }
    });
}
