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

import { injectable, inject } from "inversify";
import { Workspace, TextDocumentEdit, TextEdit, TextDocument, Range } from "@theia/languages/lib/browser";
import { CommandHandler } from '@theia/core/lib/common';
import { MergeConflictCommandArgument, MergeConflict } from './merge-conflict';

@injectable()
export class MergeConflictResolver {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
    ) { }

    readonly acceptCurrent: CommandHandler = {
        execute: args => this.doAcceptCurrent(args)
    };

    readonly acceptIncoming: CommandHandler = {
        execute: args => this.doAcceptIncoming(args)
    };

    readonly acceptBoth: CommandHandler = {
        execute: args => this.doAcceptBoth(args)
    };

    protected doAcceptCurrent(argument: MergeConflictCommandArgument) {
        this.doAccept(argument, (textOfRange, conflict) =>
            textOfRange(conflict.current.content!));
    }

    protected doAcceptIncoming(argument: MergeConflictCommandArgument) {
        this.doAccept(argument, (textOfRange, conflict) =>
            textOfRange(conflict.incoming.content!));
    }

    protected doAcceptBoth(argument: MergeConflictCommandArgument) {
        this.doAccept(argument, (textOfRange, conflict) => {
            const currentText = textOfRange(conflict.current.content);
            const incomingText = textOfRange(conflict.incoming.content);
            return `${currentText}\n${incomingText}`;
        });
    }

    protected doAccept(argument: MergeConflictCommandArgument, newTextFn: ((textOfRange: (range: Range | undefined) => string, conflict: MergeConflict) => string)) {
        const { uri, conflict } = argument;
        const document = this.workspace.textDocuments.find(d => d.uri === uri);
        if (document) {
            const newText = newTextFn(range => this.getTextRange(range, document), conflict);
            this.workspace.applyEdit!({
                documentChanges: [TextDocumentEdit.create(document, [TextEdit.replace(conflict.total!, newText)])]
            });
        }
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
