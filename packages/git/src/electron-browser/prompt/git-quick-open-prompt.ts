// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { QuickInputService } from '@theia/core/lib/browser';
import PQueue from 'p-queue';
import { GitPrompt } from '../../common/git-prompt';

@injectable()
export class GitQuickOpenPrompt extends GitPrompt {

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    protected readonly queue = new PQueue({ autoStart: true, concurrency: 1 });

    override async ask(question: GitPrompt.Question): Promise<GitPrompt.Answer> {
        return this.queue.add(() => {
            const { details, text, password } = question;
            return new Promise<GitPrompt.Answer>(async resolve => {
                const result = await this.quickInputService?.input({
                    placeHolder: text,
                    prompt: details!,
                    password,
                });
                resolve(GitPrompt.Success.create(result!));
            });
        }).then((answer: GitPrompt.Answer | void) => {
            if (!answer) {
                return { type: GitPrompt.Answer.Type.CANCEL };
            }
            return answer;
        });
    }
    override dispose(): void {
        if (!this.queue.isPaused) {
            this.queue.pause();
        }
        this.queue.clear();
    }
}
