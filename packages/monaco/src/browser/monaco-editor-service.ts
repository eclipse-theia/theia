/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { MonacoToProtocolConverter } from "monaco-languageclient";
import URI from "@theia/core/lib/common/uri";
import { OpenerService, open, WidgetOpenMode } from '@theia/core/lib/browser';
import { EditorWidget, EditorOpenerOptions } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';

import IEditorService = monaco.editor.IEditorService;
import IResourceInput = monaco.editor.IResourceInput;
import IEditorReference = monaco.editor.IEditorReference;

@injectable()
export class MonacoEditorService implements IEditorService {

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter
    ) { }

    openEditor(input: IResourceInput, sideBySide?: boolean | undefined): monaco.Promise<IEditorReference | undefined> {
        const uri = new URI(input.resource.toString());
        const openerOptions = this.createEditorOpenerOptions(input);
        return monaco.Promise.wrap(open(this.openerService, uri, openerOptions).then(widget => {
            if (widget instanceof EditorWidget && widget.editor instanceof MonacoEditor) {
                return widget.editor;
            }
            return undefined;
        }));
    }

    protected createEditorOpenerOptions(input: IResourceInput, sideBySide?: boolean | undefined): EditorOpenerOptions {
        const mode = this.getEditorOpenMode(input);
        const selection = input.options && this.m2p.asRange(input.options.selection);
        return { mode, selection };
    }
    protected getEditorOpenMode(input: IResourceInput): WidgetOpenMode {
        const options = {
            preserveFocus: false,
            revealIfVisible: true,
            ...input.options
        };
        if (options.preserveFocus) {
            return 'reveal';
        }
        return options.revealIfVisible ? 'activate' : 'open';
    }

}
