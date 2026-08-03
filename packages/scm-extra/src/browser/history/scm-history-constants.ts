// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { Command, Event, nls } from '@theia/core';
import { OpenViewArguments } from '@theia/core/lib/browser';
import { ScmFileChangeNode, ScmHistoryCommit } from '../scm-file-change-node';

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export const SCM_HISTORY_ID = 'scm-history';
/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export const SCM_HISTORY_LABEL = nls.localizeByDefault('History');
/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export const SCM_HISTORY_TOGGLE_KEYBINDING = 'alt+h';
/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export const SCM_HISTORY_MAX_COUNT = 100;

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export namespace ScmHistoryCommands {
    export const OPEN_FILE_HISTORY: Command = {
        id: 'scm-history:open-file-history',
    };
    export const OPEN_BRANCH_HISTORY: Command = {
        id: 'scm-history:open-branch-history',
        label: SCM_HISTORY_LABEL
    };
}

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export interface ScmHistoryOpenViewArguments extends OpenViewArguments {
    uri: string | undefined;
}

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export const ScmHistorySupport = Symbol('scm-history-support');
/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export interface ScmHistorySupport {
    getCommitHistory(options?: HistoryWidgetOptions): Promise<ScmHistoryCommit[]>;
    readonly onDidChangeHistory: Event<void>;
}

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export interface ScmCommitNode {
    commitDetails: ScmHistoryCommit;
    authorAvatar: string;
    fileChangeNodes: ScmFileChangeNode[];
    expanded: boolean;
    selected: boolean;
}

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export namespace ScmCommitNode {
    export function is(node: unknown): node is ScmCommitNode {
        return !!node && typeof node === 'object' && 'commitDetails' in node && 'expanded' in node && 'selected' in node;
    }
}

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export interface HistoryWidgetOptions {
    range?: {
        toRevision?: string;
        fromRevision?: string;
    };
    uri?: string;
    maxCount?: number;
}

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export type ScmHistoryListNode = (ScmCommitNode | ScmFileChangeNode);
