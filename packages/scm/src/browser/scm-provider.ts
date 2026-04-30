// *****************************************************************************
// Copyright (C) 2019 Red Hat, Inc. and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Disposable, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { CancellationToken } from '@theia/core/lib/common/cancellation';

export interface ScmProvider extends Disposable {
    readonly id: string;
    readonly label: string;
    readonly rootUri: string;
    readonly handle?: number;

    readonly acceptInputCommand?: ScmCommand;

    readonly groups: ScmResourceGroup[];
    readonly onDidChange: Event<void>;
    readonly onDidChangeResources?: Event<void>;

    readonly statusBarCommands?: ScmCommand[];
    readonly onDidChangeStatusBarCommands?: Event<ScmCommand[] | undefined>;

    readonly onDidChangeCommitTemplate: Event<string>;

    readonly amendSupport?: ScmAmendSupport;

    readonly actionButton?: ScmActionButton;
    readonly onDidChangeActionButton?: Event<ScmActionButton | undefined>;

    readonly providerContextValue?: string;

    readonly historyProvider?: ScmHistoryProvider;
}

export const ScmResourceGroup = Symbol('ScmResourceGroup');
export interface ScmResourceGroup extends Disposable {
    readonly id: string;
    readonly label: string;
    readonly resources: ScmResource[];
    readonly hideWhenEmpty?: boolean;
    readonly contextValue?: string;

    readonly provider: ScmProvider;
}

export interface ScmResource {
    /** The uri of the underlying resource inside the workspace. */
    readonly sourceUri: URI;
    readonly decorations?: ScmResourceDecorations;
    open(): Promise<void>;

    readonly group: ScmResourceGroup;
}

export interface ScmResourceDecorations {
    icon?: string;
    iconDark?: string;
    tooltip?: string;
    source?: string;
    letter?: string;
    color?: string;
    strikeThrough?: boolean;
}

export interface ScmCommand {
    title: string;
    tooltip?: string;
    command?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arguments?: any[];
}

export interface ScmCommit {
    readonly id: string;  // eg Git sha or Mercurial revision number
    readonly summary: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDateRelative: string;
}

export interface ScmAmendSupport {
    getInitialAmendingCommits(amendingHeadCommitId: string, latestCommitId: string | undefined): Promise<ScmCommit[]>
    getMessage(commit: string): Promise<string>;
    reset(commit: string): Promise<void>;
    getLastCommit(): Promise<ScmCommit | undefined>;
}

export interface ScmActionButton {
    command: ScmCommand;
    secondaryCommands?: ScmCommand[][];
    enabled?: boolean;
    description?: string;
}

export interface ScmHistoryItemRef {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly revision?: string;
    readonly icon?: string;
    readonly category?: string;
}

export interface ScmHistoryItemRefsChangeEvent {
    readonly added: readonly ScmHistoryItemRef[];
    readonly removed: readonly ScmHistoryItemRef[];
    readonly modified: readonly ScmHistoryItemRef[];
}

export interface ScmHistoryOptions {
    readonly skip?: number;
    readonly limit?: number | { id?: string };
    readonly historyItemRefs?: readonly string[];
    readonly filterText?: string;
}

export interface ScmHistoryItemStatistics {
    readonly files: number;
    readonly insertions: number;
    readonly deletions: number;
}

export interface ScmHistoryItem {
    readonly id: string;
    readonly parentIds?: readonly string[];
    readonly subject: string;
    readonly message?: string;
    readonly author?: string;
    readonly authorEmail?: string;
    readonly authorIcon?: string;
    readonly displayId?: string;
    readonly timestamp?: number;
    readonly tooltip?: string;
    readonly statistics?: ScmHistoryItemStatistics;
    readonly references?: readonly ScmHistoryItemRef[];
}

export interface ScmHistoryItemChange {
    readonly uri: string;
    readonly originalUri?: string;
    readonly modifiedUri?: string;
    readonly renameUri?: string;
}

export interface ScmHistoryProvider {
    readonly currentHistoryItemRef?: ScmHistoryItemRef;
    readonly currentHistoryItemRemoteRef?: ScmHistoryItemRef;
    readonly currentHistoryItemBaseRef?: ScmHistoryItemRef;
    readonly onDidChangeCurrentHistoryItemRefs: Event<void>;
    readonly onDidChangeHistoryItemRefs: Event<ScmHistoryItemRefsChangeEvent>;

    provideHistoryItemRefs(historyItemRefs: string[] | undefined, token: CancellationToken): Promise<ScmHistoryItemRef[] | undefined>;
    provideHistoryItems(options: ScmHistoryOptions, token: CancellationToken): Promise<ScmHistoryItem[] | undefined>;
    provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined, token: CancellationToken): Promise<ScmHistoryItemChange[] | undefined>;
    resolveHistoryItem(historyItemId: string, token: CancellationToken): Promise<ScmHistoryItem | undefined>;
    resolveHistoryItemRefsCommonAncestor(historyItemRefs: string[], token: CancellationToken): Promise<string | undefined>;
}
