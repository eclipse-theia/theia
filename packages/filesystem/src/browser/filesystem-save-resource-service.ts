// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { environment, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Navigatable, Saveable, SaveableSource, SaveOptions, Widget, open, OpenerService, ConfirmDialog, FormatType, CommonCommands } from '@theia/core/lib/browser';
import { SaveResourceService } from '@theia/core/lib/browser/save-resource-service';
import URI from '@theia/core/lib/common/uri';
import { FileService } from './file-service';
import { FileDialogService } from './file-dialog';

@injectable()
export class FilesystemSaveResourceService extends SaveResourceService {

    @inject(FileService) protected readonly fileService: FileService;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(OpenerService) protected readonly openerService: OpenerService;

    /**
     * This method ensures a few things about `widget`:
     * - `widget.getResourceUri()` actually returns a URI.
     * - `widget.saveable.createSnapshot` is defined.
     * - `widget.saveable.revert` is defined.
     */
    override canSaveAs(widget: Widget | undefined): widget is Widget & SaveableSource & Navigatable {
        return widget !== undefined
            && Saveable.isSource(widget)
            && typeof widget.saveable.createSnapshot === 'function'
            && typeof widget.saveable.revert === 'function'
            && Navigatable.is(widget)
            && widget.getResourceUri() !== undefined;
    }

    /**
     * Save `sourceWidget` to a new file picked by the user.
     */
    override async saveAs(sourceWidget: Widget & SaveableSource & Navigatable, options?: SaveOptions): Promise<void> {
        let exist: boolean = false;
        let overwrite: boolean = false;
        let selected: URI | undefined;
        const canSave = this.canSaveNotSaveAs(sourceWidget);
        const uri: URI = sourceWidget.getResourceUri()!;
        do {
            selected = await this.fileDialogService.showSaveDialog(
                {
                    title: CommonCommands.SAVE_AS.label!,
                    filters: {},
                    inputValue: uri.path.base
                });
            if (selected) {
                exist = await this.fileService.exists(selected);
                if (exist) {
                    overwrite = await this.confirmOverwrite(selected);
                }
            }
        } while ((selected && exist && !overwrite) || (selected?.isEqual(uri) && !canSave));
        if (selected && selected.isEqual(uri)) {
            await this.save(sourceWidget, options);
        } else if (selected) {
            try {
                await this.copyAndSave(sourceWidget, selected, overwrite);
            } catch (e) {
                console.warn(e);
            }
        }
    }

    /**
     * @param sourceWidget widget to save as `target`.
     * @param target The new URI for the widget.
     * @param overwrite
     */
    private async copyAndSave(sourceWidget: Widget & SaveableSource & Navigatable, target: URI, overwrite: boolean): Promise<void> {
        const snapshot = sourceWidget.saveable.createSnapshot!();
        if (!await this.fileService.exists(target)) {
            const sourceUri = sourceWidget.getResourceUri()!;
            if (this.fileService.canHandleResource(sourceUri)) {
                await this.fileService.copy(sourceUri, target, { overwrite });
            } else {
                await this.fileService.createFile(target);
            }
        }
        const targetWidget = await open(this.openerService, target, { widgetOptions: { ref: sourceWidget } });
        const targetSaveable = Saveable.get(targetWidget);
        if (targetWidget && targetSaveable && targetSaveable.applySnapshot) {
            targetSaveable.applySnapshot(snapshot);
            await sourceWidget.saveable.revert!();
            sourceWidget.close();
            Saveable.save(targetWidget, { formatType: FormatType.ON });
        } else {
            this.messageService.error(nls.localize('theia/workspace/failApply', 'Could not apply changes to new file'));
        }
    }

    async confirmOverwrite(uri: URI): Promise<boolean> {
        // Electron already handles the confirmation so do not prompt again.
        if (this.isElectron()) {
            return true;
        }
        // Prompt users for confirmation before overwriting.
        const confirmed = await new ConfirmDialog({
            title: nls.localizeByDefault('Overwrite'),
            msg: nls.localizeByDefault('{0} already exists. Are you sure you want to overwrite it?', uri.toString())
        }).open();
        return !!confirmed;
    }

    private isElectron(): boolean {
        return environment.electron.is();
    }
}
