/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

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
