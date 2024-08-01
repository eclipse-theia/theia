// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { MessageService, URI, } from '@theia/core';
import { WidgetOpenerOptions, open } from '@theia/core/lib/browser';
import { HttpOpenHandlerOptions } from '@theia/core/lib/browser/http-open-handler';
import { inject } from '@theia/core/shared/inversify';
import { Uri } from '@theia/monaco-editor-core';
import { OpenExternalOptions, OpenInternalOptions } from '@theia/monaco-editor-core/esm/vs/platform/opener/common/opener';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';

export class AIMonacoEditorProvider extends MonacoEditorProvider {
    @inject(MessageService) protected readonly messageService: MessageService;

    protected override async interceptOpen(monacoUri: Uri | string, monacoOptions?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
        // customized so we can actually inform the user about not being able to open a file
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
        } catch (error) {
            // customization: not only log the error to the console but show to user
            const details = error instanceof Error ? ': ' + error.message : '';
            this.messageService.error(`Failed to open the editor for '${uri.toString()}'${details}`, { timeout: 10_000 });
            return false;
        }
    }
}
