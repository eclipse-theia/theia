/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Widget } from "@phosphor/widgets/lib";
import { Disposable } from '../../../application/common';
import { AbstractDialog, DialogTitle } from "../../../application/browser";
import { UriSelection } from '../../../filesystem/common';
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';

export const FileDialogFactory = Symbol('FileDialogFactory');
export interface FileDialogFactory {
    (title: string): FileDialog;
}

@injectable()
export class FileDialog extends AbstractDialog<UriSelection | undefined> {

    protected readonly back: HTMLButtonElement;
    protected readonly forward: HTMLButtonElement;

    constructor(
        @inject(DialogTitle) title: string,
        @inject(FileDialogWidget) readonly fileDialogWidget: FileDialogWidget
    ) {
        super(title);
        this.toDispose.push(fileDialogWidget);

        this.back = this.appendButton('Back');
        this.forward = this.appendButton('Forward');

        this.toDispose.push(this.model.onChanged(() =>
            this.update()
        ));
        this.update();
    }

    get model(): FileDialogModel {
        return this.fileDialogWidget.model;
    }

    protected update(): void {
        this.back.disabled = !this.model.canNavigateBackward();
        this.forward.disabled = !this.model.canNavigateForward();
    }

    protected afterAttach(): void {
        Widget.attach(this.fileDialogWidget, this.contentNode);
        this.appendCloseButton();
        this.appendAcceptButton('Open');
        this.toDisposeOnDetach.push(Disposable.create(() =>
            Widget.detach(this.fileDialogWidget)
        ));
        this.addEventListener(this.back, 'click', () =>
            this.model.navigateBackward()
        );
        this.addEventListener(this.forward, 'click', () =>
            this.model.navigateForward()
        );
        super.afterAttach();
    }

    protected activate(): void {
        this.fileDialogWidget.activate();
    }

    get value(): UriSelection | undefined {
        return this.fileDialogWidget.model.selectedFileStatNode;
    }

}