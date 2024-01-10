// *****************************************************************************
// Copyright (C) 2018-2021 Google and others.
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

import URI from '@theia/core/lib/common/uri';
import { EditorWidgetFactory } from '@theia/editor/lib/browser/editor-widget-factory';
import { injectable } from '@theia/core/shared/inversify';
import { EditorPreviewWidget } from './editor-preview-widget';
import { NavigatableWidgetOptions } from '@theia/core/lib/browser';

export interface EditorPreviewOptions extends NavigatableWidgetOptions {
    preview?: boolean;
}

@injectable()
export class EditorPreviewWidgetFactory extends EditorWidgetFactory {
    static override ID: string = 'editor-preview-widget';
    override readonly id = EditorPreviewWidgetFactory.ID;

    override async createWidget(options: EditorPreviewOptions): Promise<EditorPreviewWidget> {
        const uri = new URI(options.uri);
        const editor = await this.createEditor(uri, options) as EditorPreviewWidget;
        if (options.preview) {
            editor.initializePreview();
        }
        return editor;
    }

    protected override async constructEditor(uri: URI): Promise<EditorPreviewWidget> {
        const textEditor = await this.editorProvider(uri);
        return new EditorPreviewWidget(textEditor, this.selectionService);
    }
}
