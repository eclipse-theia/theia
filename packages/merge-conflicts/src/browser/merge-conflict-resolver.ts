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

import { injectable, inject } from 'inversify';
import { TextEdit, TextDocument, Range } from '@theia/languages/lib/browser';
import { CommandHandler } from '@theia/core/lib/common';
import { MergeConflictCommandArgument, MergeConflict } from './merge-conflict';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class MergeConflictResolver {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    readonly acceptCurrent: CommandHandler = {
        execute: args => this.doAcceptCurrent(args)
    };

    readonly acceptIncoming: CommandHandler = {
        execute: args => this.doAcceptIncoming(args)
    };

    readonly acceptBoth: CommandHandler = {
        execute: args => this.doAcceptBoth(args)
    };

    protected doAcceptCurrent(argument: MergeConflictCommandArgument): void {
        this.doAccept(argument, (textOfRange, conflict) =>
            textOfRange(conflict.current.content!));
    }

    protected doAcceptIncoming(argument: MergeConflictCommandArgument): void {
        this.doAccept(argument, (textOfRange, conflict) =>
            textOfRange(conflict.incoming.content!));
    }

    protected doAcceptBoth(argument: MergeConflictCommandArgument): void {
        this.doAccept(argument, (textOfRange, conflict) => {
            const currentText = textOfRange(conflict.current.content);
            const incomingText = textOfRange(conflict.incoming.content);
            return `${currentText}\n${incomingText}`;
        });
    }

    protected async doAccept(argument: MergeConflictCommandArgument,
        newTextFn: ((textOfRange: (range: Range | undefined) => string, conflict: MergeConflict) => string)): Promise<void> {
        const { uri, conflict } = argument;
        const editorWidget = await this.editorManager.getByUri(new URI(uri));
        if (!editorWidget) {
            return;
        }
        const newText = newTextFn(range => this.getTextRange(range, editorWidget.editor.document), conflict);
        editorWidget.editor.executeEdits([TextEdit.replace(conflict.total!, newText)]);
    }

    protected getTextRange(range: Range | undefined, document: TextDocument): string {
        if (!range) {
            return '';
        }
        const start = document.offsetAt(range.start);
        const end = document.offsetAt(range.end);
        const text = document.getText().substring(start, end);
        return text;
    }

}
