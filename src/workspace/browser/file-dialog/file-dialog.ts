/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Message } from '@phosphor/messaging';
import { AbstractDialog, DialogTitle } from "../../../application/browser";
import { UriSelection } from '../../../filesystem/common';
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';

export const FileDialogFactory = Symbol('FileDialogFactory');
export interface FileDialogFactory {
    (title: string): FileDialog;
}

export const NAVIGATION_PANEL_CLASS = 'theia-NavigationPanel';
export const CONTROL_PANEL_CLASS = 'theia-ControlPanel';

@injectable()
export class FileDialog extends AbstractDialog<UriSelection | undefined> {

    protected readonly back: HTMLButtonElement;
    protected readonly forward: HTMLButtonElement;

    constructor(
        @inject(DialogTitle) title: string,
        @inject(FileDialogWidget) readonly widget: FileDialogWidget
    ) {
        super(title);
        this.toDispose.push(widget);
        this.toDispose.push(this.model.onChanged(() =>
            this.update()
        ));

        const navigationPanel = document.createElement('div');
        navigationPanel.classList.add(NAVIGATION_PANEL_CLASS);
        this.contentNode.appendChild(navigationPanel);

        this.back = this.appendButton('Back', navigationPanel);
        this.forward = this.appendButton('Forward', navigationPanel);

        this.contentNode.appendChild(this.widget.node);

        const controlPanel = document.createElement('div');
        controlPanel.classList.add(CONTROL_PANEL_CLASS);
        this.contentNode.appendChild(controlPanel);

        this.appendCloseButton('Cancel', controlPanel);
        this.appendAcceptButton('Open', controlPanel);
    }

    get model(): FileDialogModel {
        return this.widget.model;
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.back.disabled = !this.model.canNavigateBackward();
        this.forward.disabled = !this.model.canNavigateForward();
    }

    protected onAfterAttach(msg: Message): void {
        this.addEventListener(this.back, 'click', () =>
            this.model.navigateBackward()
        );
        this.addEventListener(this.forward, 'click', () =>
            this.model.navigateForward()
        );
        super.onAfterAttach(msg);
    }

    protected onActivateRequest(msg: Message): void {
        this.widget.activate();
    }

    get value(): UriSelection | undefined {
        return this.widget.model.selectedFileStatNode;
    }

}