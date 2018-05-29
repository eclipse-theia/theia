/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Message } from '@phosphor/messaging';
import { Disposable } from "@theia/core/lib/common";
import { AbstractDialog, ConfirmDialog, DialogProps, Key, Widget, setEnabled, createIconButton } from '@theia/core/lib/browser';
import { FileStatNode, DirNode } from '../file-tree';
import { LocationListRenderer } from '../location';
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';

export const FileDialogFactory = Symbol('FileDialogFactory');
export interface FileDialogFactory {
    (props: FileDialogProps): FileDialog;
}

export const NAVIGATION_PANEL_CLASS = 'theia-NavigationPanel';
export const CONTROL_PANEL_CLASS = 'theia-ControlPanel';

@injectable()
export class FileDialogProps extends DialogProps {
    constructor(
        public readonly title: string,
        public acceptDirectory: boolean = true,
        public getDirectoryNotAcceptedError: (selected: FileStatNode | undefined) => string = () => 'Selecting a directory is unaccepted.',
        public acceptFile: boolean = true,
        public getFileNotAcceptedError: (selected: FileStatNode | undefined) => string = () => 'Selecting a file is unaccepted.',
        public dialogType: 'Open' | 'Save' = 'Open'
    ) {
        super(title);
    }

    isSaveFileDialog(): boolean {
        return this.dialogType === 'Save';
    }

    isOpenFileDialog(): boolean {
        return this.dialogType === 'Open';
    }
}

@injectable()
export class FileDialog extends AbstractDialog<Readonly<FileStatNode> | undefined> {

    protected readonly back: HTMLSpanElement;
    protected readonly forward: HTMLSpanElement;
    protected readonly locationListRenderer: LocationListRenderer;
    protected readonly navigationPanel: HTMLDivElement;

    protected readonly acceptButtonText: string = 'Open';
    protected readonly closeButtonText: string = 'Cancel';

    constructor(
        @inject(FileDialogProps) protected readonly props: FileDialogProps,
        @inject(FileDialogWidget) readonly widget: FileDialogWidget
    ) {
        super(props);
        this.toDispose.push(widget);
        this.toDispose.push(this.model.onChanged(() =>
            this.update()
        ));
        this.toDispose.push(this.model.onDidOpenFile(() =>
            this.accept()
        ));

        this.navigationPanel = document.createElement('div');
        this.navigationPanel.classList.add(NAVIGATION_PANEL_CLASS);
        this.contentNode.appendChild(this.navigationPanel);

        this.navigationPanel.appendChild(this.back = createIconButton('fa', 'fa-chevron-left'));
        this.navigationPanel.appendChild(this.forward = createIconButton('fa', 'fa-chevron-right'));

        this.locationListRenderer = this.createLocationListRenderer();
        this.navigationPanel.appendChild(this.locationListRenderer.host);
    }

    get model(): FileDialogModel {
        return this.widget.model;
    }

    protected createLocationListRenderer(): LocationListRenderer {
        return new LocationListRenderer(this.model);
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        setEnabled(this.back, this.model.canNavigateBackward());
        setEnabled(this.forward, this.model.canNavigateForward());
        this.locationListRenderer.render();
    }

    protected onAfterAttach(msg: Message): void {
        Widget.attach(this.widget, this.contentNode);
        this.toDisposeOnDetach.push(Disposable.create(() =>
            Widget.detach(this.widget)
        ));

        this.appendCloseButton(this.closeButtonText);
        this.appendAcceptButton(this.acceptButtonText);

        this.addKeyListener(this.back, Key.ENTER, () => this.model.navigateBackward(), 'click');
        this.addKeyListener(this.forward, Key.ENTER, () => this.model.navigateForward(), 'click');
        super.onAfterAttach(msg);
    }

    protected onActivateRequest(msg: Message): void {
        this.widget.activate();
    }

    get value(): Readonly<FileStatNode> | undefined {
        return this.getFirstSelectedNode();
    }

    protected accept(): void {
        const selected = this.value;
        let error;
        if (this.props && !this.props.acceptDirectory && selected && selected.fileStat.isDirectory) {
            error = this.props.getDirectoryNotAcceptedError(selected);
        }
        if (this.props && !this.props.acceptFile && selected && !selected.fileStat.isDirectory) {
            error = this.props.getFileNotAcceptedError(selected);
        }
        if (error) {
            const dialog = new ConfirmDialog({
                title: 'Error',
                msg: error,
                type: 'Info'
            });
            dialog.open();
        } else {
            super.accept();
        }
    }

    protected getFirstSelectedNode(): Readonly<DirNode> | undefined {
        return this.widget.model.selectedFileStatNodes[0] as DirNode;
    }
}
