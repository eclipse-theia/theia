/********************************************************************************
 * Copyright (C) 2020 Arm and others.
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
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { ScmService } from './scm-service';
import { ScmTreeModel } from './scm-tree-model';
import { ScmResourceGroup, ScmProvider } from './scm-provider';

@injectable()
export class ScmGroupsTreeModel extends ScmTreeModel {

    @inject(ScmService) protected readonly scmService: ScmService;

    protected readonly toDisposeOnRepositoryChange = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        super.init();
        this.refreshOnRepositoryChange();
        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => {
            this.refreshOnRepositoryChange();
        }));
    }

    protected refreshOnRepositoryChange(): void {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            this.changeRepository(repository.provider);
        } else {
            this.changeRepository(undefined);
        }
    }

    protected changeRepository(provider: ScmProvider | undefined): void {
        this.toDisposeOnRepositoryChange.dispose();
        this.provider = provider;
        if (provider) {
            this.toDisposeOnRepositoryChange.push(provider.onDidChange(() => {
                this.root = this.createTree();
            }));
            this.root = this.createTree();
        }
    }

    get rootUri(): string | undefined {
        if (this.provider) {
            return this.provider.rootUri;
        }
    };

    get groups(): ScmResourceGroup[] {
        if (this.provider) {
            return this.provider.groups;
        } else {
            return [];
        }
    };

    canTabToWidget(): boolean {
        return !!this.provider;
    }
}
