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

import { inject, injectable } from "inversify";
import {
    QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickOpenService,
    OpenerService, KeybindingRegistry, Keybinding
} from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/filesystem';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { FileSearchService } from '../common/file-search-service';
import { CancellationTokenSource } from '@theia/core/lib/common';
import { LabelProvider } from "@theia/core/lib/browser/label-provider";
import { Command } from '@theia/core/lib/common';

export const quickFileOpen: Command = {
    id: 'file-search.openFile',
    label: 'Open File...'
};

@injectable()
export class QuickFileOpenService implements QuickOpenModel {

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService,
        @inject(FileSearchService) protected readonly fileSearchService: FileSearchService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider
    ) {
        workspaceService.root.then(root => this.wsRoot = root);
    }

    protected wsRoot: FileStat | undefined;

    /**
     * Whether to hide .gitignored (and other ignored) files.
     */
    protected hideIgnoredFiles: boolean = true;

    /**
     * Whether the dialog is currently open.
     */
    protected isOpen: boolean = false;

    /**
     * The current lookFor string input by the user.
     */
    protected currentLookFor: string = "";

    isEnabled(): boolean {
        return this.wsRoot !== undefined;
    }

    open(): void {
        let placeholderText = "File name to search.";
        const keybinding = this.getKeyCommand();
        if (keybinding) {
            placeholderText += ` (Press ${keybinding} to show/hide ignored files)`;
        }

        // Triggering the keyboard shortcut while the dialog is open toggles
        // showing the ignored files.
        if (this.isOpen) {
            this.hideIgnoredFiles = !this.hideIgnoredFiles;
        } else {
            this.hideIgnoredFiles = true;
            this.currentLookFor = "";
            this.isOpen = true;
        }

        this.quickOpenService.open(this, {
            placeholder: placeholderText,
            prefix: this.currentLookFor,
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
            fuzzySort: true,
            onClose: () => {
                this.isOpen = false;
            },
        });
    }

    /**
     * Get a string (suitable to show to the user) representing the keyboard
     * shortcut used to open the quick file open menu.
     */
    protected getKeyCommand(): string | undefined {
        const keyCommand = this.keybindingRegistry.getKeybindingsForCommand(quickFileOpen.id);
        if (keyCommand) {
            // We only consider the first keybinding.
            const accel = Keybinding.acceleratorFor(keyCommand[0], '+');
            return accel.join(' ');
        }

        return undefined;
    }

    private cancelIndicator = new CancellationTokenSource();

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        if (!this.wsRoot) {
            return;
        }

        this.currentLookFor = lookFor;

        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;
        const proposed = new Set<string>();
        const rootUri = this.wsRoot.uri;
        const handler = async (result: string[]) => {
            if (!token.isCancellationRequested) {
                const root = new URI(rootUri);
                result.forEach(p => {
                    const uri = root.withPath(root.path.join(p)).toString();
                    proposed.add(uri);
                });
                const itemPromises = Array.from(proposed).map(uri => this.toItem(uri));
                acceptor(await Promise.all(itemPromises));
            }
        };
        this.fileSearchService.find(lookFor, {
            rootUri,
            fuzzyMatch: true,
            limit: 200,
            useGitIgnore: this.hideIgnoredFiles,
        }, token).then(handler);
    }

    private async toItem(uriString: string) {
        const uri = new URI(uriString);
        return new FileQuickOpenItem(uri,
            this.labelProvider.getName(uri),
            await this.labelProvider.getIcon(uri),
            this.labelProvider.getLongName(uri.parent),
            this.openerService);
    }

}

export class FileQuickOpenItem extends QuickOpenItem {

    constructor(
        protected readonly uri: URI,
        protected readonly label: string,
        protected readonly icon: string,
        protected readonly parent: string,
        protected readonly openerService: OpenerService
    ) {
        super();
    }

    getLabel(): string {
        return this.label;
    }

    isHidden(): boolean {
        return false;
    }

    getTooltip(): string {
        return this.uri.path.toString();
    }

    getDescription(): string {
        return this.parent;
    }

    getUri(): URI {
        return this.uri;
    }

    getIconClass(): string {
        return this.icon + ' file-icon';
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.openerService.getOpener(this.uri).then(opener => opener.open(this.uri));
        return true;
    }
}
