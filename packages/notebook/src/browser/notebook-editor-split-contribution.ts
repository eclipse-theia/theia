// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Widget, DockLayout } from '@theia/core/lib/browser';
import { SplitEditorContribution } from '@theia/editor/lib/browser/split-editor-contribution';
import { NotebookEditorWidget } from './notebook-editor-widget';
import { NotebookOpenHandler } from './notebook-open-handler';

/**
 * Implementation of SplitEditorContribution for notebook editors (NotebookEditorWidget).
 * Delegates to NotebookOpenHandler.openToSide which handles counter management for splits.
 */
@injectable()
export class NotebookEditorSplitContribution implements SplitEditorContribution<NotebookEditorWidget> {

    @inject(NotebookOpenHandler)
    protected readonly notebookOpenHandler: NotebookOpenHandler;

    canHandle(widget: Widget): number {
        return widget instanceof NotebookEditorWidget ? 100 : 0;
    }

    async split(widget: NotebookEditorWidget, splitMode: DockLayout.InsertMode): Promise<NotebookEditorWidget | undefined> {
        const uri = widget.getResourceUri();
        if (!uri) {
            return undefined;
        }

        const newNotebook = await this.notebookOpenHandler.openToSide(uri, {
            notebookType: widget.notebookType,
            widgetOptions: { mode: splitMode, ref: widget }
        });

        return newNotebook;
    }
}

