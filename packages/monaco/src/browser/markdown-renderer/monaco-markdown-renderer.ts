// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
import { ILanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/languages/language';
import { MarkdownRenderer as CodeMarkdownRenderer, IMarkdownRendererOptions } from '@theia/monaco-editor-core/esm/vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import * as monaco from '@theia/monaco-editor-core';
import { OpenerService, PreferenceService, WidgetOpenerOptions, open } from '@theia/core/lib/browser';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '@theia/monaco-editor-core/esm/vs/platform/opener/common/opener';
import { HttpOpenHandlerOptions } from '@theia/core/lib/browser/http-open-handler';
import { URI } from '@theia/core/lib/common/uri';
import { MarkdownRenderer, MarkdownRenderOptions, MarkdownRenderResult } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkedOptions, MarkdownRenderOptions as MonacoMarkdownRenderOptions } from '@theia/monaco-editor-core/esm/vs/base/browser/markdownRenderer';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { DisposableStore } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { DisposableCollection, DisposableGroup } from '@theia/core';

@injectable()
export class MonacoMarkdownRenderer implements MarkdownRenderer {
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    protected delegate: CodeMarkdownRenderer;
    protected _openerService: OpenerService | undefined;

    render(markdown: MarkdownString | undefined, options?: MarkdownRenderOptions, markedOptions?: MarkedOptions): MarkdownRenderResult {
        return this.delegate.render(markdown, this.transformOptions(options), markedOptions);
    }

    protected transformOptions(options?: MarkdownRenderOptions): MonacoMarkdownRenderOptions | undefined {
        if (!options?.actionHandler) {
            return options as MarkdownRenderOptions & { actionHandler: undefined } | undefined;
        }
        const monacoActionHandler: MonacoMarkdownRenderOptions['actionHandler'] = {
            disposables: this.toDisposableStore(options.actionHandler.disposables),
            callback: (content, e) => options.actionHandler!.callback(content, e?.browserEvent)
        };
        return { ...options, actionHandler: monacoActionHandler };
    }

    protected toDisposableStore(current: DisposableGroup): DisposableStore {
        if (current instanceof DisposableStore) {
            return current;
        } else if (current instanceof DisposableCollection) {
            const store = new DisposableStore();
            current['disposables'].forEach(disposable => store.add(disposable));
            return store;
        } else {
            return new DisposableStore();
        }
    }

    @postConstruct()
    protected init(): void {
        const languages = StandaloneServices.get(ILanguageService);
        const openerService = StandaloneServices.get(IOpenerService);
        openerService.registerOpener({
            open: (u, options) => this.interceptOpen(u, options)
        });
        const that = this;
        const prefs = new class implements IMarkdownRendererOptions {
            get codeBlockFontFamily(): string | undefined {
                return that.preferences.get<string>('editor.fontFamily');
            }
        };

        this.delegate = new CodeMarkdownRenderer(prefs, languages, openerService);
    }

    protected async interceptOpen(monacoUri: monaco.Uri | string, monacoOptions?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
        let options = undefined;
        if (monacoOptions) {
            if ('openToSide' in monacoOptions && monacoOptions.openToSide) {
                options = Object.assign(options || {}, <WidgetOpenerOptions>{
                    widgetOptions: {
                        mode: 'split-right'
                    }
                });
            }
            if ('openExternal' in monacoOptions && monacoOptions.openExternal) {
                options = Object.assign(options || {}, <HttpOpenHandlerOptions>{
                    openExternal: true
                });
            }
        }
        const uri = new URI(monacoUri.toString());
        try {
            await open(this.openerService, uri, options);
            return true;
        } catch (e) {
            console.error(`Fail to open '${uri.toString()}':`, e);
            return false;
        }
    }
}
