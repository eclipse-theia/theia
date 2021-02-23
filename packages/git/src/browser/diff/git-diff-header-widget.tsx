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

import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { ScmFileChangeLabelProvider } from '@theia/scm-extra/lib/browser/scm-file-change-label-provider';
import { ReactWidget, StatefulWidget, KeybindingRegistry } from '@theia/core/lib/browser';
import { Git } from '../../common';
import * as React from '@theia/core/shared/react';

/* eslint-disable no-null/no-null */

@injectable()
export class GitDiffHeaderWidget extends ReactWidget implements StatefulWidget {

    @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry;
    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ScmFileChangeLabelProvider) protected readonly scmLabelProvider: ScmFileChangeLabelProvider;

    protected options: Git.Options.Diff;

    protected authorAvatar: string;

    constructor(
    ) {
        super();
        this.id = 'git-diff-header';
        this.title.closable = true;
        this.title.iconClass = 'icon-git-commit tab-git-icon';
    }

    async setContent(options: Git.Options.Diff): Promise<void> {
        this.options = options;
        this.update();
    }

    protected render(): React.ReactNode {
        return React.createElement('div', this.createContainerAttributes(), this.renderDiffListHeader());
    }

    /**
     * Create the container attributes for the widget.
     */
    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        return {
            style: { flexGrow: 0 }
        };
    }

    protected renderDiffListHeader(): React.ReactNode {
        return this.doRenderDiffListHeader(
            this.renderRepositoryHeader(),
            this.renderPathHeader(),
            this.renderRevisionHeader(),
        );
    }

    protected doRenderDiffListHeader(...children: React.ReactNode[]): React.ReactNode {
        return <div className='diff-header'>{...children}</div>;
    }

    protected renderRepositoryHeader(): React.ReactNode {
        if (this.options && this.options.uri) {
            return this.renderHeaderRow({ name: 'repository', value: this.getRepositoryLabel(this.options.uri) });
        }
        return undefined;
    }

    protected getRepositoryLabel(uri: string): string | undefined {
        const repository = this.scmService.findRepository(new URI(uri));
        const isSelectedRepo = this.scmService.selectedRepository && repository && this.scmService.selectedRepository.provider.rootUri === repository.provider.rootUri;
        return repository && !isSelectedRepo ? this.labelProvider.getLongName(new URI(repository.provider.rootUri)) : undefined;
    }

    protected renderPathHeader(): React.ReactNode {
        return this.renderHeaderRow({
            classNames: ['diff-header'],
            name: 'path',
            value: this.renderPath()
        });
    }
    protected renderPath(): React.ReactNode {
        if (this.options.uri) {
            const path = this.scmLabelProvider.relativePath(this.options.uri);
            if (path.length > 0) {
                return '/' + path;
            } else {
                return this.labelProvider.getLongName(new URI(this.options.uri));
            }
        }
        return null;
    }

    protected renderRevisionHeader(): React.ReactNode {
        return this.renderHeaderRow({
            classNames: ['diff-header'],
            name: 'revision: ',
            value: this.renderRevision()
        });
    }
    protected renderRevision(): React.ReactNode {
        if (!this.fromRevision) {
            return null;
        }
        if (typeof this.fromRevision === 'string') {
            return this.fromRevision;
        }
        return (this.toRevision || 'HEAD') + '~' + this.fromRevision;
    }

    protected renderHeaderRow({ name, value, classNames, title }: { name: string, value: React.ReactNode, classNames?: string[], title?: string }): React.ReactNode {
        if (!value) {
            return;
        }
        const className = ['header-row', ...(classNames || [])].join(' ');
        return <div key={name} className={className} title={title}>
            <div className='theia-header'>{name}</div>
            <div className='header-value'>{value}</div>
        </div>;
    }

    protected get toRevision(): string | undefined {
        return this.options.range && this.options.range.toRevision;
    }

    protected get fromRevision(): string | number | undefined {
        return this.options.range && this.options.range.fromRevision;
    }

    storeState(): object {
        const { options } = this;
        return {
            options
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restoreState(oldState: any): void {
        const options = oldState['options'];
        this.setContent(options);
    }

}
