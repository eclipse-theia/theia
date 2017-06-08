/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Message } from '@phosphor/messaging';
import { AbstractDialog, DialogProps } from "../../../application/browser";
import { UriSelection } from '../../../filesystem/common';
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';
import { LocationListRenderer } from './location-list-renderer';

export const FileDialogFactory = Symbol('FileDialogFactory');
export interface FileDialogFactory {
    (props: FileDialogProps): FileDialog;
}

export const NAVIGATION_PANEL_CLASS = 'theia-NavigationPanel';
export const CONTROL_PANEL_CLASS = 'theia-ControlPanel';

@injectable()
export class FileDialogProps extends DialogProps {
}

@injectable()
export class FileDialog extends AbstractDialog<UriSelection | undefined> {

    protected readonly back: HTMLButtonElement;
    protected readonly forward: HTMLButtonElement;
    protected readonly locationListRenderer: LocationListRenderer;

    constructor(
        @inject(FileDialogProps) props: FileDialogProps,
        @inject(FileDialogWidget) readonly widget: FileDialogWidget
    ) {
        super(props);
        this.toDispose.push(widget);
        this.toDispose.push(this.model.onChanged(() =>
            this.update()
        ));

        const navigationPanel = document.createElement('div');
        navigationPanel.classList.add(NAVIGATION_PANEL_CLASS);
        this.contentNode.appendChild(navigationPanel);

        navigationPanel.appendChild(this.back = this.createButton('Back'));
        navigationPanel.appendChild(this.forward = this.createButton('Forward'));

        this.locationListRenderer = new LocationListRenderer(this.model);
        navigationPanel.appendChild(this.locationListRenderer.host);

        this.contentNode.appendChild(this.widget.node);

        const controlPanel = document.createElement('div');
        controlPanel.classList.add(CONTROL_PANEL_CLASS);
        this.contentNode.appendChild(controlPanel);

        controlPanel.appendChild(this.createCloseButton('Cancel'));
        controlPanel.appendChild(this.createAcceptButton('Open'));
    }

    get model(): FileDialogModel {
        return this.widget.model;
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.back.disabled = !this.model.canNavigateBackward();
        this.forward.disabled = !this.model.canNavigateForward();
        this.locationListRenderer.render();
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
