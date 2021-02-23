/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { Command, CommandService } from '@theia/core/lib/common/command';
import { AbstractDialog } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import * as DOMPurify from 'dompurify';

@injectable()
export class OpenUriCommandHandler {
    public static readonly COMMAND_METADATA: Command = {
        id: 'theia.open'
    };

    private openNewTabDialog: OpenNewTabDialog;

    constructor(
        @inject(WindowService)
        protected readonly windowService: WindowService,
        @inject(CommandService)
        protected readonly commandService: CommandService
    ) {
        this.openNewTabDialog = new OpenNewTabDialog(windowService);
    }

    public execute(resource: URI | string | undefined): void {
        if (!resource) {
            return;
        }

        const uriString = resource.toString();
        if (uriString.startsWith('http://') || uriString.startsWith('https://')) {
            this.openWebUri(uriString);
        } else {
            this.commandService.executeCommand('editor.action.openLink', uriString);
        }
    }

    private openWebUri(uri: string): void {
        try {
            this.windowService.openNewWindow(uri);
        } catch (err) {
            // browser has blocked opening of a new tab
            this.openNewTabDialog.showOpenNewTabDialog(uri);
        }
    }
}

class OpenNewTabDialog extends AbstractDialog<string> {
    protected readonly windowService: WindowService;
    protected readonly openButton: HTMLButtonElement;
    protected readonly messageNode: HTMLDivElement;
    protected readonly linkNode: HTMLAnchorElement;
    value: string;

    constructor(windowService: WindowService) {
        super({
            title: 'Your browser prevented opening of a new tab'
        });
        this.windowService = windowService;

        this.linkNode = document.createElement('a');
        this.linkNode.target = '_blank';
        this.linkNode.setAttribute('style', 'color: var(--theia-editorWidget-foreground);');
        this.contentNode.appendChild(this.linkNode);

        const messageNode = document.createElement('div');
        messageNode.innerText = 'You are going to open: ';
        messageNode.appendChild(this.linkNode);
        this.contentNode.appendChild(messageNode);

        this.appendCloseButton();
        this.openButton = this.appendAcceptButton('Open');
    }

    showOpenNewTabDialog(uri: string): void {
        this.value = uri;

        this.linkNode.innerHTML = DOMPurify.sanitize(uri);
        this.linkNode.href = uri;
        this.openButton.onclick = () => {
            this.windowService.openNewWindow(uri);
        };

        // show dialog window to user
        this.open();
    }
}
