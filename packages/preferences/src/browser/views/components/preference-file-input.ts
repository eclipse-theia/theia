// *****************************************************************************
// Copyright (C) 2022 EclipseSource and others.
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

import { isObject } from '@theia/core/lib/common';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { OpenFileDialogProps } from '@theia/filesystem/lib/browser';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { Preference } from '../../util/preference-types';
import { PreferenceNodeRenderer } from './preference-node-renderer';
import { PreferenceLeafNodeRendererContribution } from './preference-node-renderer-creator';
import { PreferenceStringInputRenderer } from './preference-string-input';

export interface FileNodeTypeDetails {
    isFilepath: true;
    selectionProps?: Partial<OpenFileDialogProps>;
}

export namespace FileNodeTypeDetails {
    export function is(typeDetails: unknown): typeDetails is FileNodeTypeDetails {
        return isObject<FileNodeTypeDetails>(typeDetails) && !!typeDetails.isFilepath;
    }
}

@injectable()
export class PreferenceSingleFilePathInputRendererContribution extends PreferenceLeafNodeRendererContribution {
    static ID = 'preference-single-file-path-input-renderer';
    id = PreferenceSingleFilePathInputRendererContribution.ID;

    canHandleLeafNode(node: Preference.LeafNode): number {
        const typeDetails = node.preference.data.typeDetails;
        return FileNodeTypeDetails.is(typeDetails) && !typeDetails.selectionProps?.canSelectMany ? 5 : 0;
    }

    createLeafNodeRenderer(container: interfaces.Container): PreferenceNodeRenderer {
        return container.get(PreferenceSingleFilePathInputRenderer);
    }
}

@injectable()
export class PreferenceSingleFilePathInputRenderer extends PreferenceStringInputRenderer {
    @inject(FileDialogService) fileDialogService: FileDialogService;

    get typeDetails(): FileNodeTypeDetails {
        return this.preferenceNode.preference.data.typeDetails as FileNodeTypeDetails;
    }

    protected createInputWrapper(): HTMLElement {
        const inputWrapper = document.createElement('div');
        inputWrapper.classList.add('preference-file-container');
        return inputWrapper;
    }

    protected override createInteractable(parent: HTMLElement): void {
        const inputWrapper = this.createInputWrapper();

        super.createInteractable(inputWrapper);
        this.interactable.classList.add('preference-file-input');

        this.createBrowseButton(inputWrapper);

        parent.appendChild(inputWrapper);
    }

    protected createBrowseButton(parent: HTMLElement): void {
        const button = document.createElement('button');
        button.classList.add('theia-button', 'main', 'preference-file-button');
        button.textContent = nls.localize('theia/core/file/browse', 'Browse');
        const handler = this.browse.bind(this);
        button.onclick = handler;
        button.onkeydown = handler;
        button.tabIndex = 0;
        button.setAttribute('aria-label', 'Submit Preference Input');
        parent.appendChild(button);
    }

    protected async browse(): Promise<void> {
        const selectionProps = this.typeDetails.selectionProps;
        const title = selectionProps?.title ?? selectionProps?.canSelectFolders ? WorkspaceCommands.OPEN_FOLDER.dialogLabel : WorkspaceCommands.OPEN_FILE.dialogLabel;
        const selection = await this.fileDialogService.showOpenDialog({ title, ...selectionProps });
        if (selection) {
            this.setPreferenceImmediately(selection.path.fsPath());
        }
    }

    protected override setPreferenceImmediately(value: string): Promise<void> {
        this.interactable.value = value;
        return super.setPreferenceImmediately(value);
    }
}
