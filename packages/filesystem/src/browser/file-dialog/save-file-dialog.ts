/*
 * Copyright (C) 2017 Ericsson.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { FileDialog, FileDialogProps } from './file-dialog';
import { FileDialogWidget } from './file-dialog-widget';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { FileStatNode } from '../file-tree';
import URI from '@theia/core/lib/common/uri';

export const SaveFileDialogFactory = Symbol('SaveFileDialogFactory');
export interface SaveFileDialogFactory {
    (props: FileDialogProps): SaveFileDialog;
}

@injectable()
export class SaveFileDialog extends FileDialog {

    protected readonly inputField: HTMLInputElement;

    protected readonly acceptButtonText: string = 'Save';

    constructor(
        @inject(FileDialogProps) props: FileDialogProps,
        @inject(FileDialogWidget) readonly widget: FileDialogWidget
    ) {
        super(props, widget);

        this.inputField = document.createElement('input');
        this.inputField.type = 'text';
        this.inputField.setAttribute('style', 'line-height: inherit;');
        this.inputField.setAttribute('placeholder', 'Enter the name of workspace...');
        this.inputField.value = '';
        this.navigationPanel.appendChild(this.inputField);
    }

    protected async accept(): Promise<void> {
        if (this.resolve) {
            const value = this.getFirstSelectedNode();
            const error = this.isValid(value);
            if (error) {
                this.setErrorMessage(error);
            } else if (value) {
                const configFileName = this.inputField.value.trim(); // TODO spaces and other special chars in file name ?
                if (value.fileStat.isDirectory && (!configFileName || configFileName === '')) {
                    new ConfirmDialog({
                        title: 'Missing Information',
                        msg: 'Enter the name of the config file.',
                        type: 'Info'
                    }).open();
                    return;
                }
                if (!value.fileStat.isDirectory || value.children.findIndex(child => child.name === configFileName) >= 0) {
                    // make sure the user does want to overwrite the existing file
                    const dialog = new ConfirmDialog({
                        title: 'Overwrite',
                        msg: `Do you really want to overwrite "${value.name}"?`
                    });
                    if (!await dialog.open()) {
                        return;
                    }
                }

                super.accept();
            }
        }
    }

    get value(): Readonly<FileStatNode> | undefined {
        const selected = this.getFirstSelectedNode();
        if (selected && selected.fileStat.isDirectory) { // if directory, return "directory path + user specified file name"
            const configFileName = this.inputField.value;
            if (!configFileName || configFileName === '') {
                return undefined;
            }
            const path = `${selected.fileStat.uri}/${configFileName}`;
            return {
                id: path,
                name: configFileName,
                fileStat: {
                    uri: path,
                    lastModification: selected.fileStat.lastModification,
                    isDirectory: false
                },
                uri: new URI(path),
                selected: true
            } as FileStatNode;
        }
        // if not directory, return the selected file
        return selected;
    }
}
