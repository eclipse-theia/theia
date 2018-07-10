/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { EditorManager, EditorOpenerOptions } from '@theia/editor/lib/browser/editor-manager';
import { DebugSession } from './debug-model';
import { DebugProtocol } from 'vscode-debugprotocol';
import { EditorWidget } from '@theia/editor/lib/browser/editor-widget';
import { pathToUri } from "../common/debug-utils";
import URI from '@theia/core/lib/common/uri';

@injectable()
export class SourceOpener {
    constructor(@inject(EditorManager) protected readonly editorManager: EditorManager) { }

    async open(debugSession: DebugSession, frame: DebugProtocol.StackFrame | undefined): Promise<EditorWidget> {
        if (!frame || !frame.source) {
            return Promise.reject('The source to open is not specified.');
        }

        const source = frame.source;
        if (source.sourceReference && source.sourceReference > 0) {
            return debugSession.source({ sourceReference: source.sourceReference })
                .then(response => {
                    const uri = new URI(encodeURI('mem-txt:///' + source.name + '?' + response.body.content));
                    return this.editorManager.open(uri, this.toEditorOpenerOption(frame));
                });
        }

        if (source.path) {
            return this.editorManager.open(pathToUri(source.path), this.toEditorOpenerOption(frame));
        }

        return Promise.reject('The source to open is not specified.');
    }

    private toEditorOpenerOption(frame: DebugProtocol.StackFrame): EditorOpenerOptions {
        return {
            selection: {
                start: {
                    line: frame.line - 1,
                    character: frame.column - 1
                }
            }
        };
    }
}
