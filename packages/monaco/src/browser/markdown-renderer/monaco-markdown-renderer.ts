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
import { MarkdownRendererService as CodeMarkdownRenderer }
    from '@theia/monaco-editor-core/esm/vs/platform/markdown/browser/markdownRenderer';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import * as monaco from '@theia/monaco-editor-core';
import { OpenerService, WidgetOpenerOptions, open } from '@theia/core/lib/browser';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '@theia/monaco-editor-core/esm/vs/platform/opener/common/opener';
import { HttpOpenHandlerOptions } from '@theia/core/lib/browser/http-open-handler';
import { URI } from '@theia/core/lib/common/uri';
import { MarkdownRenderer, MarkdownRenderOptions, MarkdownRenderResult } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownRenderOptions as MonacoMarkdownRenderOptions } from '@theia/monaco-editor-core/esm/vs/base/browser/markdownRenderer';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { DisposableStore } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { DisposableCollection, DisposableGroup } from '@theia/core';

@injectable()
export class MonacoMarkdownRenderer implements MarkdownRenderer {
    @inject(OpenerService) protected readonly openerService: OpenerService;

    protected delegate: CodeMarkdownRenderer;
    protected _openerService: OpenerService | undefined;

    render(markdown: MarkdownString, options?: MarkdownRenderOptions): MarkdownRenderResult {
        return this.delegate.render(markdown, this.transformOptions(options));
    }

    protected transformOptions(options?: MarkdownRenderOptions): MonacoMarkdownRenderOptions | undefined {
        if (!options) {
            return undefined;
        }
        const { actionHandler, ...opts } = options;
        if (!actionHandler) {
            return opts;
        }
        return {
            ...opts,
            actionHandler: (content: string) => actionHandler.callback(content)
        };
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
        const openerService = StandaloneServices.get(IOpenerService);
        openerService.registerOpener({
            open: (u, options) => this.interceptOpen(u, options)
        });

        this.delegate = new CodeMarkdownRenderer(openerService);
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
