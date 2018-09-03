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

import { injectable, inject, decorate } from 'inversify';
import { MonacoToProtocolConverter } from 'monaco-languageclient';
import URI from '@theia/core/lib/common/uri';
import { OpenerService, open, WidgetOpenMode, ApplicationShell } from '@theia/core/lib/browser';
import { EditorWidget, EditorOpenerOptions, EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';

import ICodeEditor = monaco.editor.ICodeEditor;
import CommonCodeEditor = monaco.editor.CommonCodeEditor;
import IResourceInput = monaco.editor.IResourceInput;

decorate(injectable(), monaco.services.CodeEditorServiceImpl);

@injectable()
export class MonacoEditorService extends monaco.services.CodeEditorServiceImpl {

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(MonacoToProtocolConverter)
    protected readonly m2p: MonacoToProtocolConverter;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(EditorManager)
    protected readonly editors: EditorManager;

    getActiveCodeEditor(): ICodeEditor | undefined {
        const editor = MonacoEditor.getActive(this.editors);
        return editor && editor.getControl();
    }

    openCodeEditor(input: IResourceInput, source?: ICodeEditor, sideBySide?: boolean): monaco.Promise<CommonCodeEditor | undefined> {
        const uri = new URI(input.resource.toString());
        const openerOptions = this.createEditorOpenerOptions(input, source, sideBySide);
        return monaco.Promise.wrap(open(this.openerService, uri, openerOptions).then(widget => {
            if (widget instanceof EditorWidget && widget.editor instanceof MonacoEditor) {
                return widget.editor.getControl();
            }
            return undefined;
        }));
    }

    protected createEditorOpenerOptions(input: IResourceInput, source?: ICodeEditor, sideBySide?: boolean): EditorOpenerOptions {
        const mode = this.getEditorOpenMode(input);
        const selection = input.options && this.m2p.asRange(input.options.selection);
        const widgetOptions = this.getWidgetOptions(source, sideBySide);
        return { mode, selection, widgetOptions };
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
    protected getWidgetOptions(source?: ICodeEditor, sideBySide?: boolean): ApplicationShell.WidgetOptions | undefined {
        const ref = MonacoEditor.getWidgetFor(this.editors, source);
        if (!ref) {
            return undefined;
        }
        const area = (ref && this.shell.getAreaFor(ref)) || 'main';
        const mode = ref && sideBySide ? 'split-right' : undefined;
        return { area, mode, ref };
    }

}
