/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { TextEditor } from '../editor';
import { EditorDecoration } from './editor-decoration';

@injectable()
export abstract class EditorDecorator {

    protected readonly appliedDecorations = new Map<string, string[]>();

    protected setDecorations(editor: TextEditor, newDecorations: EditorDecoration[]): void {
        const uri = editor.uri.toString();
        const oldDecorations = this.appliedDecorations.get(uri) || [];
        if (oldDecorations.length === 0 && newDecorations.length === 0) {
            return;
        }
        const decorationIds = editor.deltaDecorations({ oldDecorations, newDecorations });
        this.appliedDecorations.set(uri, decorationIds);
    }

}
