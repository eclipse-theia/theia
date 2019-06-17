/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { injectable } from 'inversify';
import { Event, Emitter, Disposable, DisposableCollection } from '../../common';
import { TreeNode } from './tree';

/**
 * Progress indicator that contributes indicators to a tree.
 */
export interface TreeProgress {

    /**
     * Fired when a change has occured to any of the progress data.
     */
    readonly onDidChangeProgress: Event<void>;

    /**
     * Given a tree node, returns progress data associated with the node, or undefined
     * if nothing to progress for the node.
     */
    getProgressIndicator(node: TreeNode): TreeProgressData | undefined;

}

/**
 * Progress service which emits events from all known tree progress indicators.
 * This service consolidates progress indicator data collected from all the progress contributors known by this service.
 */
export const TreeProgressService = Symbol('TreeProgressService');
export interface TreeProgressService extends Disposable {

    /**
     * Fired when any of the progress indicators have changes.
     */
    readonly onDidChangeProgress: Event<void>;

    /**
     * Returns with the progress data for the given tree node, consolidating data from all progress contributors.
     */
    getProgressIndicators(node: TreeNode): TreeProgressData[];

}

/**
 * The default tree progress indicator service. Does nothing at all. One has to rebind to a concrete implementation
 * if progress indicators are to be supported in the tree widget.
 */
@injectable()
export class NoopTreeProgressService implements TreeProgressService {

    protected readonly emitter = new Emitter<void>();
    readonly onDidChangeProgress = this.emitter.event;

    dispose(): void {
        this.emitter.dispose();
    }

    getProgressIndicators(node: TreeNode) {
        return [];
    }
}

@injectable()
export class NoopTreeProgressContribution implements TreeProgress {

    protected readonly emitter = new Emitter<void>();
    readonly onDidChangeProgress = this.emitter.event;

    getProgressIndicator(node: TreeNode) {
        return undefined;
    }
}

/**
 * Abstract progress indicator service implementation which emits events from all known progress contributors.
 */
@injectable()
export abstract class AbstractTreeProgressService implements TreeProgressService {

    protected readonly onDidChangeProgressEmitter = new Emitter<void>();
    readonly onDidChangeProgress = this.onDidChangeProgressEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    constructor(protected readonly progressContributors: ReadonlyArray<TreeProgress>) {
        this.toDispose.push(this.onDidChangeProgressEmitter);
        this.toDispose.pushAll(this.progressContributors.map(progressContributor =>
            progressContributor.onDidChangeProgress(() =>
                this.onDidChangeProgressEmitter.fire(undefined)
            ))
        );
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    getProgressIndicators(node: TreeNode) {
        const progressIndicators: TreeProgressData[] = [];
        for (const progressContributor of this.progressContributors) {
            const progressIndicator = progressContributor.getProgressIndicator(node);
            if (progressIndicator) {
                progressIndicators.push(progressIndicator);
            }
        }
        return progressIndicators;
    }

}

export interface TreeProgressData {

    /**
     * A title to indentify the task to the user
     */
    readonly title?: string;

}
