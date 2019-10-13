/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { ScmCommit } from '@theia/scm/lib/browser/scm-provider';
import URI from '@theia/core/lib/common/uri';

export interface ScmFileChangeNode {
    readonly fileChange: ScmFileChange;
    readonly commitId: string;
    selected?: boolean;
}
export namespace ScmFileChangeNode {
    export function is(node: Object | undefined): node is ScmFileChangeNode {
        return !!node && 'fileChange' in node && 'commitId' in node;
    }
}

export interface ScmHistoryCommit extends ScmCommit {
    readonly commitDetailUri: URI;
    readonly fileChanges: ScmFileChange[];
    readonly commitDetailOptions: {};
}

export interface ScmFileChange {
    readonly uri: string;
    getCaption(): string;
    getStatusCaption(): string;
    getStatusAbbreviation(): string;
    getClassNameForStatus(): string;
    getUriToOpen(): URI;
}
