/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { QuickOpenItem, QuickOpenMode, QuickOpenModel } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { QuickOpenService, QuickOpenOptions } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { ScmService } from './scm-service';
import { ScmRepository } from './scm-repository';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';

@injectable()
export class ScmQuickOpenService {

    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ScmService) protected readonly scmService: ScmService;

    async changeRepository(): Promise<void> {
        const repositories = this.scmService.repositories;
        if (repositories.length > 1) {
            const items = await Promise.all(repositories.map(async repository => {
                const uri = new URI(repository.provider.rootUri);
                const execute = () => {
                    this.scmService.selectedRepository = repository;
                };
                const toLabel = () => this.labelProvider.getName(uri);
                const toDescription = () => this.labelProvider.getLongName(uri);
                return new ScmQuickOpenItem<ScmRepository>(repository, execute, toLabel, toDescription);
            }));
            this.open(items, 'Select repository to work with:');
        }
    }

    private open(items: QuickOpenItem | QuickOpenItem[], placeholder: string): void {
        this.quickOpenService.open(this.getModel(Array.isArray(items) ? items : [items]), this.getOptions(placeholder));
    }

    private getModel(items: QuickOpenItem | QuickOpenItem[]): QuickOpenModel {
        return {
            onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                acceptor(Array.isArray(items) ? items : [items]);
            }
        };
    }

    private getOptions(placeholder: string, fuzzyMatchLabel: boolean = true, onClose: (canceled: boolean) => void = () => { }): QuickOpenOptions {
        return QuickOpenOptions.resolve({
            placeholder,
            fuzzyMatchLabel,
            fuzzySort: false,
            onClose
        });
    }
}

class ScmQuickOpenItem<T> extends QuickOpenItem {

    constructor(
        public readonly ref: T,
        protected readonly execute: (item: ScmQuickOpenItem<T>) => void,
        private readonly toLabel: (item: ScmQuickOpenItem<T>) => string = () => `${ref}`,
        private readonly toDescription: (item: ScmQuickOpenItem<T>) => string | undefined = () => undefined) {

        super();
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.execute(this);
        return true;
    }

    getLabel(): string {
        return this.toLabel(this);
    }

    getDescription(): string | undefined {
        return this.toDescription(this);
    }

}
