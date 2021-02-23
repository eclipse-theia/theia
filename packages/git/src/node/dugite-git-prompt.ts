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

import { injectable } from '@theia/core/shared/inversify';
import { GitPromptServer, GitPromptClient, GitPrompt } from '../common/git-prompt';

@injectable()
export class DugiteGitPromptServer implements GitPromptServer, GitPromptClient {

    protected client: GitPromptClient | undefined;

    dispose(): void {
    }

    setClient(client: GitPromptClient | undefined): void {
        this.client = client;
    }

    async ask(question: GitPrompt.Question): Promise<GitPrompt.Answer> {
        if (this.client) {
            return this.client.ask(question);
        }
        return GitPrompt.Failure.create('Not yet available.');
    }

}
