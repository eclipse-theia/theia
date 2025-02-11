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

import { CommonCommands, KeybindingRegistry, OpenerService, QuickAccessProvider, QuickAccessRegistry } from '@theia/core/lib/browser';
import { QuickInputService, QuickPickItem, QuickPicks } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { CancellationToken, Command, nls } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { EditorOpenerOptions, EditorWidget, Position, Range } from '@theia/editor/lib/browser';
import { NavigationLocationService } from '@theia/editor/lib/browser/navigation/navigation-location-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { QuickFileSelectService } from './quick-file-select-service';

export const quickFileOpen = Command.toDefaultLocalizedCommand({
    id: 'file-search.openFile',
    category: CommonCommands.FILE_CATEGORY,
    label: 'Open File...'
});
export interface FilterAndRange {
    filter: string;
    range?: Range;
}

// Supports patterns of <path><#|:><line><#|:|,><col?>
const LINE_COLON_PATTERN = /\s?[#:\(](?:line )?(\d*)(?:[#:,](\d*))?\)?\s*$/;
export type FileQuickPickItem = QuickPickItem & { uri: URI };

@injectable()
export class QuickFileOpenService implements QuickAccessProvider {
    static readonly PREFIX = '';

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;
    @inject(QuickAccessRegistry)
    protected readonly quickAccessRegistry: QuickAccessRegistry;
    @inject(NavigationLocationService)
    protected readonly navigationLocationService: NavigationLocationService;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(QuickFileSelectService)
    protected readonly quickFileSelectService: QuickFileSelectService;

    registerQuickAccessProvider(): void {
        this.quickAccessRegistry.registerQuickAccessProvider({
            getInstance: () => this,
            prefix: QuickFileOpenService.PREFIX,
            placeholder: this.getPlaceHolder(),
            helpEntries: [{ description: 'Open File', needsEditor: false }]
        });
    }

    /**
     * Whether to hide .gitignored (and other ignored) files.
     */
    protected hideIgnoredFiles = true;

    /**
     * Whether the dialog is currently open.
     */
    protected isOpen = false;
    private updateIsOpen = true;

    protected filterAndRangeDefault = { filter: '', range: undefined };

    /**
     * Tracks the user file search filter and location range e.g. fileFilter:line:column or fileFilter:line,column
     */
    protected filterAndRange: FilterAndRange = this.filterAndRangeDefault;

    @postConstruct()
    protected init(): void {
        this.quickInputService?.onHide(() => {
            if (this.updateIsOpen) {
                this.isOpen = false;
            } else {
                this.updateIsOpen = true;
            }
        });
    }

    isEnabled(): boolean {
        return this.workspaceService.opened;
    }

    open(): void {
        // Triggering the keyboard shortcut while the dialog is open toggles
        // showing the ignored files.
        if (this.isOpen) {
            this.hideIgnoredFiles = !this.hideIgnoredFiles;
            this.hideQuickPick();
        } else {
            this.hideIgnoredFiles = true;
            this.filterAndRange = this.filterAndRangeDefault;
            this.isOpen = true;
        }

        this.quickInputService?.open(this.filterAndRange.filter);
    }

    protected hideQuickPick(): void {
        this.updateIsOpen = false;
        this.quickInputService?.hide();
    }

    /**
     * Get a string (suitable to show to the user) representing the keyboard
     * shortcut used to open the quick file open menu.
     */
    protected getKeyCommand(): string | undefined {
        const keyCommand = this.keybindingRegistry.getKeybindingsForCommand(quickFileOpen.id);
        if (keyCommand) {
            // We only consider the first keybinding.
            const accel = this.keybindingRegistry.acceleratorFor(keyCommand[0], '+');
            return accel.join(' ');
        }

        return undefined;
    }

    async getPicks(filter: string, token: CancellationToken): Promise<QuickPicks> {
        this.filterAndRange = this.splitFilterAndRange(filter);
        const fileFilter = this.filterAndRange.filter;
        return this.quickFileSelectService.getPicks(fileFilter, token, {
            hideIgnoredFiles: this.hideIgnoredFiles,
            onSelect: item => this.openFile(item.uri)
        },
        );
    }

    openFile(uri: URI): void {
        const options = this.buildOpenerOptions();
        const closedEditor = this.navigationLocationService.closedEditorsStack.find(editor => editor.uri.path.toString() === uri.path.toString());
        this.openerService.getOpener(uri, options)
            .then(opener => opener.open(uri, options))
            .then(widget => {
                // Attempt to restore the editor state if it exists, and no selection is explicitly requested.
                if (widget instanceof EditorWidget && closedEditor && !options.selection) {
                    widget.editor.restoreViewState(closedEditor.viewState);
                }
            })
            .catch(error => {
                console.warn(error);
                this.messageService.error(nls.localizeByDefault("Unable to open '{0}'", uri.path.toString()));
            });
    }

    protected buildOpenerOptions(): EditorOpenerOptions {
        return { selection: this.filterAndRange.range };
    }

    private getPlaceHolder(): string {
        let placeholder = nls.localizeByDefault('Search files by name (append {0} to go to line or {1} to go to symbol)', ':', '@');
        const keybinding = this.getKeyCommand();
        if (keybinding) {
            placeholder += nls.localize('theia/file-search/toggleIgnoredFiles', ' (Press {0} to show/hide ignored files)', keybinding);
        }
        return placeholder;
    }

    /**
     * Splits the given expression into a structure of search-file-filter and
     * location-range.
     *
     * @param expression patterns of <path><#|:><line><#|:|,><col?>
     */
    protected splitFilterAndRange(expression: string): FilterAndRange {
        let filter = expression;
        let range = undefined;

        // Find line and column number from the expression using RegExp.
        const patternMatch = LINE_COLON_PATTERN.exec(expression);

        if (patternMatch) {
            const line = parseInt(patternMatch[1] ?? '', 10);
            if (Number.isFinite(line)) {
                const lineNumber = line > 0 ? line - 1 : 0;

                const column = parseInt(patternMatch[2] ?? '', 10);
                const startColumn = Number.isFinite(column) && column > 0 ? column - 1 : 0;
                const position = Position.create(lineNumber, startColumn);

                filter = expression.substring(0, patternMatch.index);
                range = Range.create(position, position);
            }
        }
        return { filter, range };
    }
}
