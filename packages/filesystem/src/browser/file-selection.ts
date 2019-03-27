/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { SelectionService } from '@theia/core/lib/common/selection-service';
import { SelectionCommandHandler } from '@theia/core/lib/common/selection-command-handler';
import { FileStat } from '../common/filesystem';

export interface FileSelection {
    fileStat: FileStat
}
export namespace FileSelection {
    export function is(arg: Object | undefined): arg is FileSelection {
        return typeof arg === 'object' && ('fileStat' in arg) && FileStat.is(arg['fileStat']);
    }
    export class CommandHandler extends SelectionCommandHandler<FileSelection> {

        constructor(
            protected readonly selectionService: SelectionService,
            protected readonly options: SelectionCommandHandler.Options<FileSelection>
        ) {
            super(
                selectionService,
                arg => FileSelection.is(arg) ? arg : undefined,
                options
            );
        }

    }

}
