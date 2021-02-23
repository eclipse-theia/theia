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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ScmAvatarService } from '@theia/scm/lib/browser/scm-avatar-service';
import { GitCommitDetailWidgetOptions } from './git-commit-detail-widget-options';
import { ReactWidget, KeybindingRegistry } from '@theia/core/lib/browser';
import { Git } from '../../common';
import * as React from '@theia/core/shared/react';

@injectable()
export class GitCommitDetailHeaderWidget extends ReactWidget {

    @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry;
    @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService;

    protected options: Git.Options.Diff;

    protected authorAvatar: string;

    constructor(
        @inject(GitCommitDetailWidgetOptions) protected readonly commitDetailOptions: GitCommitDetailWidgetOptions
    ) {
        super();
        this.id = 'commit-header' + commitDetailOptions.commitSha;
        this.title.label = commitDetailOptions.commitSha.substr(0, 8);
        this.options = {
            range: {
                fromRevision: commitDetailOptions.commitSha + '~1',
                toRevision: commitDetailOptions.commitSha
            }
        };
        this.title.closable = true;
        this.title.iconClass = 'icon-git-commit tab-git-icon';
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.authorAvatar = await this.avatarService.getAvatar(this.commitDetailOptions.authorEmail);
    }

    protected render(): React.ReactNode {
        return React.createElement('div', this.createContainerAttributes(), this.renderDiffListHeader());
    }

    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        return {
            style: { flexGrow: 0 }
        };
    }

    protected renderDiffListHeader(): React.ReactNode {
        const authorEMail = this.commitDetailOptions.authorEmail;
        const subject = <div className='subject'>{this.commitDetailOptions.commitMessage}</div>;
        const body = <div className='body'>{this.commitDetailOptions.messageBody || ''}</div>;
        const subjectRow = <div className='header-row'><div className='subjectContainer'>{subject}{body}</div></div>;
        const author = <div className='author header-value noWrapInfo'>{this.commitDetailOptions.authorName}</div>;
        const mail = <div className='mail header-value noWrapInfo'>{`<${authorEMail}>`}</div>;
        const authorRow = <div className='header-row noWrapInfo'><div className='theia-header'>author: </div>{author}</div>;
        const mailRow = <div className='header-row noWrapInfo'><div className='theia-header'>e-mail: </div>{mail}</div>;
        const authorDate = new Date(this.commitDetailOptions.authorDate);
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
            <div className='header-value noWrapInfo'>{this.commitDetailOptions.commitSha}</div>
        </div>;
        const gravatar = <div className='image-container'>
            <img className='gravatar' src={this.authorAvatar}></img></div>;
        const commitInfo = <div className='header-row commit-info-row'>{gravatar}<div className='commit-info'>{authorRow}{mailRow}{dateRow}{revisionRow}</div></div>;

        return <div className='diff-header'>{subjectRow}{commitInfo}</div>;
    }
}
