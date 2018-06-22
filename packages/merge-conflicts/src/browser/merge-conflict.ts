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

import { Range } from "@theia/languages/lib/common";
import { Command } from '@theia/core/lib/common';

export interface MarkedRegion {
    marker?: Range;
    content?: Range;
}

export interface MergeConflict {
    total?: Range;
    current: MarkedRegion;
    incoming: MarkedRegion;
    bases: MarkedRegion[];
}

export interface MergeConflictCommandArgument {
    uri: string;
    conflict: MergeConflict;
}

export namespace MergeConflictsCommands {
    export const AcceptCurrent: Command = {
        id: 'merge-conflicts:accept.current',
        label: 'Merge Conflict: Accept Current Change'
    };
    export const AcceptIncoming: Command = {
        id: 'merge-conflicts:accept.incoming',
        label: 'Merge Conflict: Accept Incoming Change'
    };
    export const AcceptBoth: Command = {
        id: 'merge-conflicts:accept.both',
        label: 'Merge Conflict: Accept Both Changes'
    };
}
