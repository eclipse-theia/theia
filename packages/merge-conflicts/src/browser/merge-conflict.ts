/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
