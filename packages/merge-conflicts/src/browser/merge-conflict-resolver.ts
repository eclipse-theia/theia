/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
            const currentText = textOfRange(conflict.current.content!);
            const incomingText = textOfRange(conflict.incoming.content!);
            return `${currentText}\n${incomingText}`;
        });
    }

    protected doAccept(argument: MergeConflictCommandArgument, newTextFn: ((textOfRange: (range: Range) => string, conflict: MergeConflict) => string)) {
        const { uri, conflict } = argument;
        const document = this.workspace.textDocuments.find(d => d.uri === uri);
        if (document) {
            const newText = newTextFn(range => this.getTextRange(range, document), conflict);
            this.workspace.applyEdit!({
                documentChanges: [TextDocumentEdit.create(document, [TextEdit.replace(conflict.total!, newText)])]
            });
        }
    }

    protected getTextRange(range: Range, document: TextDocument): string {
        const start = document.offsetAt(range.start);
        const end = document.offsetAt(range.end);
        const text = document.getText().substring(start, end);
        return text;
    }

}
