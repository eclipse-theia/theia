// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { SelectionService } from '@theia/core/lib/common/selection-service';
import { SelectionCommandHandler } from '@theia/core/lib/common/selection-command-handler';
import { ResourceFileEdit, ResourceTextEdit } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';
import { isObject } from '@theia/core/lib/common';

export interface BulkEditNodeSelection {
    bulkEdit: ResourceFileEdit | ResourceTextEdit;
}
export namespace BulkEditNodeSelection {
    export function is(arg: unknown): arg is BulkEditNodeSelection {
        return isObject(arg) && 'bulkEdit' in arg;
    }

    export class CommandHandler extends SelectionCommandHandler<BulkEditNodeSelection> {

        constructor(
            protected override readonly selectionService: SelectionService,
            protected override readonly options: SelectionCommandHandler.Options<BulkEditNodeSelection>
        ) {
            super(
                selectionService,
                arg => BulkEditNodeSelection.is(arg) ? arg : undefined,
                options
            );
        }
    }

}
