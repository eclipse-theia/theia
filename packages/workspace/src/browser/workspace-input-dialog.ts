/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { SingleTextInputDialog, SingleTextInputDialogProps, LabelProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from './workspace-service';

@injectable()
export class WorkspaceInputDialogProps extends SingleTextInputDialogProps {
    /**
     * The parent `URI` for the selection present in the explorer.
     * Used to display the path in which the file/folder is created at.
     */
    parentUri: URI;
}

export class WorkspaceInputDialog extends SingleTextInputDialog {

    constructor(
        @inject(WorkspaceInputDialogProps) protected readonly props: WorkspaceInputDialogProps,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(WorkspaceService) protected readonly workspaceService?: WorkspaceService
    ) {
        super(props);
        this.appendRootName();
        this.appendParentPath();
    }

    /**
     * Append the human-readable parent `path` to the dialog.
     * When possible, display the relative path, else display the full path (ex: workspace root).
     */
    protected appendParentPath(): void {
        // Compute the label for the parent URI.
        const label = this.labelProvider.getLongName(this.props.parentUri);
        const element = document.createElement('div');
        // Create the `folder` icon.
        const icon = document.createElement('i');
        icon.classList.add('fa', 'fa-folder');
        icon.style.marginRight = '0.5em';
        element.appendChild(icon);
        element.appendChild(document.createTextNode(label));
        element.style.marginBottom = '1.0em';
        // Add the path and icon div before the `inputField`.
        this.contentNode.insertBefore(element, this.inputField);
    }

    /**
     * Append the human-readable root `path` to the dialog when in a multi-root workspace.
     * When two roots have the same name, displays full path of the root, else displays the root-name.
     */
    protected appendRootName(): void {
        if (this.workspaceService && this.workspaceService.isMultiRootWorkspaceOpened) {
            const roots = this.workspaceService.tryGetRoots();
            const rootUri = this.workspaceService.getWorkspaceRootUri(this.props.parentUri);
            if (rootUri) {
                const rootsWithSameName = roots.some(singleRoot => {
                    const singleRootUri = new URI(singleRoot.uri);
                    return this.labelProvider.getName(rootUri) === this.labelProvider.getName(singleRootUri) && singleRootUri !== rootUri;
                });
                // Displays the root name if its unique, else displays the root path
                const label = rootsWithSameName ? this.labelProvider.getLongName(rootUri) : this.labelProvider.getName(rootUri);
                const element = document.createElement('div');
                const icon = document.createElement('i');
                // Creates the Root icon (circle)
                icon.classList.add('fa', 'fa-circle-o');
                icon.style.marginRight = '1.0em';
                element.appendChild(icon);
                element.appendChild(document.createTextNode(label));
                element.style.marginBottom = '0.5em';
                // Place the path and icon div before the `inputField`
                this.contentNode.insertBefore(element, this.inputField);
            }
        }
    }
}
