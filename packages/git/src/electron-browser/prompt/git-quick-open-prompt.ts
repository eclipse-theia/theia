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

import { inject, injectable } from '@theia/core/shared/inversify';
import * as PQueue from 'p-queue';
import { QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { QuickOpenService } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { GitPrompt } from '../../common/git-prompt';

@injectable()
export class GitQuickOpenPrompt extends GitPrompt {

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    protected readonly queue = new PQueue({ autoStart: true, concurrency: 1 });

    async ask(question: GitPrompt.Question): Promise<GitPrompt.Answer> {
        return this.queue.add(() => {
            const { details, text, password } = question;
            return new Promise<GitPrompt.Answer>(resolve => {
                const model = {
                    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                        acceptor([
                            new QuickOpenItem({
                                label: details,
                                run: (mode: QuickOpenMode): boolean => {
                                    if (mode !== QuickOpenMode.OPEN) {
                                        return false;
                                    }
                                    resolve(GitPrompt.Success.create(lookFor));
                                    return true;
                                }
                            })
                        ]);
                    }
                };
                const options = {
                    onClose: (canceled: boolean): void => {
                        if (canceled) {
                            resolve(GitPrompt.Cancel.create());
                        }
                    },
                    placeholder: text,
                    password
                };
                this.quickOpenService.open(model, options);
            });
        });
    }

    dispose(): void {
        if (!this.queue.isPaused) {
            this.queue.pause();
        }
        this.queue.clear();
    }

}
