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

import { injectable, inject } from 'inversify';
import { Message } from '@phosphor/messaging';
import { Disposable, MaybeArray } from '@theia/core/lib/common';
import { Key } from '@theia/core/lib/browser';
import { AbstractDialog, DialogProps, setEnabled, createIconButton, Widget } from '@theia/core/lib/browser';
import { FileStatNode } from '../file-tree';
import { LocationListRenderer } from '../location';
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';
import { FileDialogTreeFiltersRenderer, FileDialogTreeFilters } from './file-dialog-tree-filters-renderer';

export const FileDialogFactory = Symbol('FileDialogFactory');
export interface FileDialogFactory {
    (props: FileDialogProps): FileDialog;
}

export const NAVIGATION_PANEL_CLASS = 'theia-NavigationPanel';
export const CONTROL_PANEL_CLASS = 'theia-ControlPanel';

@injectable()
export class FileDialogProps extends DialogProps {
    /**
     * A human-readable string for the open button.
     */
    openLabel?: string;

    /**
     * Allow to select files, defaults to `true`.
     */
    canSelectFiles?: boolean;

    /**
     * Allow to select folders, defaults to `false`.
     */
    canSelectFolders?: boolean;

    /**
     * Allow to select many files or folders.
     */
    canSelectMany?: boolean;

    /**
     * A set of file filters that are used by the dialog. Each entry is a human readable label,
     * like "TypeScript", and an array of extensions, e.g.
     * ```ts
     * {
     * 	'Images': ['png', 'jpg']
     * 	'TypeScript': ['ts', 'tsx']
     * }
     * ```
     */
    filters?: FileDialogTreeFilters;
}

@injectable()
export class FileDialog extends AbstractDialog<MaybeArray<FileStatNode>> {

    protected readonly back: HTMLSpanElement;
    protected readonly forward: HTMLSpanElement;
    protected readonly locationListRenderer: LocationListRenderer;
    protected readonly treeFiltersRenderer: FileDialogTreeFiltersRenderer | undefined;

    constructor(
        @inject(FileDialogProps) readonly props: FileDialogProps,
        @inject(FileDialogWidget) readonly widget: FileDialogWidget
    ) {
        super(props);
        this.toDispose.push(widget);
        this.toDispose.push(this.model.onChanged(() => this.update()));
        this.toDispose.push(this.model.onDidOpenFile(() => this.accept()));
        this.toDispose.push(this.model.onSelectionChanged(() => this.update()));

        const navigationPanel = document.createElement('div');
        navigationPanel.classList.add(NAVIGATION_PANEL_CLASS);
        this.contentNode.appendChild(navigationPanel);

        navigationPanel.appendChild(this.back = createIconButton('fa', 'fa-chevron-left'));
        navigationPanel.appendChild(this.forward = createIconButton('fa', 'fa-chevron-right'));

        this.locationListRenderer = this.createLocationListRenderer();
        navigationPanel.appendChild(this.locationListRenderer.host);

        this.treeFiltersRenderer = this.createFileTreeFiltersRenderer();
    }

    get model(): FileDialogModel {
        return this.widget.model;
    }

    protected createLocationListRenderer(): LocationListRenderer {
        return new LocationListRenderer(this.model);
    }

    protected createFileTreeFiltersRenderer(): FileDialogTreeFiltersRenderer | undefined {
        if (this.props.filters) {
            return new FileDialogTreeFiltersRenderer(this.props.filters, this.widget.model.tree);
        }

        return undefined;
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        setEnabled(this.back, this.model.canNavigateBackward());
        setEnabled(this.forward, this.model.canNavigateForward());
        this.locationListRenderer.render();

        if (this.treeFiltersRenderer) {
            this.treeFiltersRenderer.render();
        }

        this.widget.update();
    }

    protected appendFiltersPanel(): void {
        if (this.treeFiltersRenderer) {
            const navigationPanel = document.createElement('div');
            navigationPanel.classList.add(NAVIGATION_PANEL_CLASS);
            this.contentNode.appendChild(navigationPanel);

            const titlePanel = document.createElement('div');
            titlePanel.innerHTML = 'Format:';
            navigationPanel.appendChild(titlePanel);

            navigationPanel.appendChild(this.treeFiltersRenderer.host);
        }
    }

    protected onAfterAttach(msg: Message): void {
        Widget.attach(this.widget, this.contentNode);
        this.toDisposeOnDetach.push(Disposable.create(() => {
            Widget.detach(this.widget);
            this.locationListRenderer.dispose();
            if (this.treeFiltersRenderer) {
                this.treeFiltersRenderer.dispose();
            }
        }));

        this.appendFiltersPanel();

        this.appendCloseButton('Cancel');
        this.appendAcceptButton(this.props.openLabel ? this.props.openLabel : 'Open');

        this.addKeyListener(this.back, Key.ENTER, () => this.model.navigateBackward(), 'click');
        this.addKeyListener(this.forward, Key.ENTER, () => this.model.navigateForward(), 'click');
        super.onAfterAttach(msg);
    }

    protected onActivateRequest(msg: Message): void {
        this.widget.activate();
    }

    isValid(value: MaybeArray<FileStatNode>): string {
        if (value) {
            if (this.props.canSelectMany) {
                if (Array.isArray(value)) {
                    const results: Readonly<FileStatNode>[] = value;
                    for (let i = 0; i < results.length; i++) {
                        const error = this.validateNode(results[i]);
                        if (error) {
                            return error;
                        }
                    }
                } else {
                    const error = this.validateNode(value);
                    if (error) {
                        return error;
                    }
                }
            } else {
                if (value instanceof Array) {
                    return 'You can select only one item';
                }

                return this.validateNode(value);
            }
        }

        return '';
    }

    protected validateNode(node: Readonly<FileStatNode>): string {
        if (typeof this.props.canSelectFiles === 'boolean'
            && !this.props.canSelectFiles && !node.fileStat.isDirectory) {
            return 'Files cannot be selected';
        }

        if (typeof this.props.canSelectFolders === 'boolean'
            && !this.props.canSelectFolders && node.fileStat.isDirectory) {
            return 'Folders cannot be selected';
        }

        return '';
    }

    get value(): MaybeArray<FileStatNode> {
        if (this.widget.model.selectedFileStatNodes.length === 1) {
            return this.widget.model.selectedFileStatNodes[0];
        } else {
            return this.widget.model.selectedFileStatNodes;
        }
    }

}
