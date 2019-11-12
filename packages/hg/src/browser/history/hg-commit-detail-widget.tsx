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

import { injectable, inject, postConstruct } from 'inversify';
import { Widget } from '@phosphor/widgets';
import { LabelProvider } from '@theia/core/lib/browser';
import { HgFileChange } from '../../common';
import { HgDiffWidget } from '../diff/hg-diff-widget';
import { HgRepositoryProvider } from '../hg-repository-provider';
import { HgFileChangeNode } from '../hg-file-change-node';
import { ScmAvatarService } from '@theia/scm/lib/browser/scm-avatar-service';
import * as React from 'react';

export interface HgCommitDetails {
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: Date;
    readonly authorDateRelative: string;
    readonly authorAvatar: string;
    readonly commitMessage: string;
    readonly messageBody?: string;
    readonly fileChangeNodes: HgFileChangeNode[];
    readonly commitSha: string;
}

export const HgCommitDetailWidgetOptions = Symbol('HgCommitDetailWidgetOptions');
export interface HgCommitDetailWidgetOptions {
    sha: string;
    summary: string;
    messageBody?: string;
    authorName: string;
    authorEmail: string;
    /**
     * The date of the commit in ISO format.
     */
    authorTimestamp: string;
    authorDateRelative: string;
}

@injectable()
export class HgCommitDetailWidget extends HgDiffWidget {

    protected avatarUrl: string;

    constructor(
        @inject(HgRepositoryProvider) protected readonly repositoryProvider: HgRepositoryProvider,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService,
        @inject(HgCommitDetailWidgetOptions) protected readonly commitDetailOptions: HgCommitDetailWidgetOptions
    ) {
        super();
        this.id = 'commit' + commitDetailOptions.sha;
        this.title.label = commitDetailOptions.sha.substr(0, 8);
        this.options = {
            range: {
                fromRevision: commitDetailOptions.sha + '~1',
                toRevision: commitDetailOptions.sha
            }
        };
        this.title.closable = true;
        this.title.iconClass = 'icon-hg-commit tab-hg-icon';
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.avatarUrl = await this.avatarService.getAvatar(this.commitDetailOptions.authorEmail);
    }

    protected renderDiffListHeader(): React.ReactNode {
        const subject = <div className='subject'>{this.commitDetailOptions.summary}</div>;
        const body = <div className='body'>{this.commitDetailOptions.messageBody || ''}</div>;
        const subjectRow = <div className='header-row'><div className='subjectContainer'>{subject}{body}</div></div>;
        const author = <div className='author header-value noWrapInfo'>{this.commitDetailOptions.authorName}</div>;
        const authorRow = <div className='header-row noWrapInfo'><div className='theia-header'>author: </div>{author}</div>;
        const authorDate = new Date(this.commitDetailOptions.authorTimestamp);
        const dateStr = authorDate.toLocaleDateString('en', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour12: true,
            hour: 'numeric',
            minute: 'numeric'
        });
        const date = <div className='date header-value noWrapInfo'>{dateStr}</div>;
        const dateRow = <div className='header-row noWrapInfo'><div className='theia-header'>date: </div>{date}</div>;
        const revisionRow = <div className='header-row noWrapInfo'>
            <div className='theia-header'>revision: </div>
            <div className='header-value noWrapInfo'>{this.commitDetailOptions.sha}</div>
        </div>;
        const gravatar = <div className='image-container'>
            <img className='gravatar' src={this.avatarUrl}></img></div>;
        const commitInfo = <div className='header-row commit-info-row'>{gravatar}<div className='commit-info'>{authorRow}{/*mailRow*/}{dateRow}{revisionRow}</div></div>;
        const header = <div className='theia-header'>Files changed</div>;

        return <div className='diff-header'>{subjectRow}{commitInfo}{header}</div>;
    }

    protected ref: Widget | undefined;
    protected async revealChange(change: HgFileChange): Promise<void> {
        const ref = this.ref;
        const widget = await this.openChange(change, {
            mode: 'reveal',
            widgetOptions: ref ?
                { area: 'main', mode: 'tab-after', ref } :
                { area: 'main', mode: 'split-right', ref: this }
        });
        this.ref = widget instanceof Widget ? widget : undefined;
        if (this.ref) {
            this.ref.disposed.connect(() => {
                if (this.ref === widget) {
                    this.ref = undefined;
                }
            });
        }
    }

}
