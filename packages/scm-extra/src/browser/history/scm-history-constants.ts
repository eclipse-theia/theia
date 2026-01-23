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

export const SCM_HISTORY_ID = 'scm-history';
export const SCM_HISTORY_LABEL = nls.localize('theia/scm/history', 'History');
export const SCM_HISTORY_TOGGLE_KEYBINDING = 'alt+h';
export const SCM_HISTORY_MAX_COUNT = 100;

export namespace ScmHistoryCommands {
    export const OPEN_FILE_HISTORY: Command = {
        id: 'scm-history:open-file-history',
    };
    export const OPEN_BRANCH_HISTORY: Command = {
        id: 'scm-history:open-branch-history',
        label: SCM_HISTORY_LABEL
    };
}

export interface ScmHistoryOpenViewArguments extends OpenViewArguments {
    uri: string | undefined;
}

export const ScmHistorySupport = Symbol('scm-history-support');
export interface ScmHistorySupport {
    getCommitHistory(options?: HistoryWidgetOptions): Promise<ScmHistoryCommit[]>;
    readonly onDidChangeHistory: Event<void>;
}

export interface ScmCommitNode {
    commitDetails: ScmHistoryCommit;
    authorAvatar: string;
    fileChangeNodes: ScmFileChangeNode[];
    expanded: boolean;
    selected: boolean;
}

export namespace ScmCommitNode {
    export function is(node: unknown): node is ScmCommitNode {
        return !!node && typeof node === 'object' && 'commitDetails' in node && 'expanded' in node && 'selected' in node;
    }
}

export interface HistoryWidgetOptions {
    range?: {
        toRevision?: string;
        fromRevision?: string;
    };
    uri?: string;
    maxCount?: number;
}

export type ScmHistoryListNode = (ScmCommitNode | ScmFileChangeNode);
