// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { ScmService } from './scm-service';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { QuickInputService } from '@theia/core/lib/browser';

@injectable()
export class ScmQuickOpenService {

    @inject(QuickInputService) @optional() protected readonly quickInputService: QuickInputService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ScmService) protected readonly scmService: ScmService;

    async changeRepository(): Promise<void> {
        const repositories = this.scmService.repositories;
        if (repositories.length > 1) {
            const items = await Promise.all(repositories.map(async repository => {
                const uri = new URI(repository.provider.rootUri);
                return {
                    label: this.labelProvider.getName(uri),
                    description: this.labelProvider.getLongName(uri),
                    execute: () => {
                        this.scmService.selectedRepository = repository;
                    }
                };
            }));
            this.quickInputService?.showQuickPick(items, { placeholder: 'Select repository to work with:' });
        }
    }
}
