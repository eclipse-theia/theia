/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import * as React from '@theia/core/shared/react';
import * as ReactDOM from '@theia/core/shared/react-dom';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MonacoEditorZoneWidget } from '@theia/monaco/lib/browser/monaco-editor-zone-widget';
import { DebugEditor } from './debug-editor';
import { DebugExceptionInfo } from '../model/debug-thread';

export interface ShowDebugExceptionParams {
    info: DebugExceptionInfo
    lineNumber: number
    column: number
}

export class DebugExceptionMonacoEditorZoneWidget extends MonacoEditorZoneWidget {

    protected computeContainerHeight(zoneHeight: number): {
        height: number,
        frameWidth: number
    } {
        // reset height to match it to the content
        this.containerNode.style.height = 'initial';
        const height = this.containerNode.offsetHeight;
        const result = super.computeContainerHeight(zoneHeight);
        result.height = height;
        return result;
    }

}

@injectable()
export class DebugExceptionWidget implements Disposable {

    @inject(DebugEditor)
    readonly editor: DebugEditor;

    protected zone: MonacoEditorZoneWidget;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected async init(): Promise<void> {
        this.toDispose.push(this.zone = new DebugExceptionMonacoEditorZoneWidget(this.editor.getControl()));
        this.zone.containerNode.classList.add('theia-debug-exception-widget');
        this.toDispose.push(Disposable.create(() => ReactDOM.unmountComponentAtNode(this.zone.containerNode)));
        this.toDispose.push(this.editor.getControl().onDidLayoutChange(() => this.layout()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    show({ info, lineNumber, column }: ShowDebugExceptionParams): void {
        this.render(info, () => {
            const fontInfo = this.editor.getControl().getOption(monaco.editor.EditorOption.fontInfo);
            this.zone.containerNode.style.fontSize = `${fontInfo.fontSize}px`;
            this.zone.containerNode.style.lineHeight = `${fontInfo.lineHeight}px`;

            if (lineNumber !== undefined && column !== undefined) {
                const afterLineNumber = lineNumber;
                const afterColumn = column;
                this.zone.show({ showFrame: true, afterLineNumber, afterColumn, heightInLines: 0, frameWidth: 1 });
            }

            this.layout();
        });
    }

    hide(): void {
        this.zone.hide();
    }

    protected render(info: DebugExceptionInfo, cb: () => void): void {
        const stackTrace = info.details && info.details.stackTrace;
        ReactDOM.render(<React.Fragment>
            <div className='title'>{info.id ? `Exception has occurred: ${info.id}` : 'Exception has occurred.'}</div>
            {info.description && <div className='description'>{info.description}</div>}
            {stackTrace && <div className='stack-trace'>{stackTrace}</div>}
        </React.Fragment>, this.zone.containerNode, cb);
    }

    protected layout(): void {
        // reset height to match it to the content
        this.zone.containerNode.style.height = 'initial';

        const lineHeight = this.editor.getControl().getOption(monaco.editor.EditorOption.lineHeight);
        const heightInLines = Math.ceil(this.zone.containerNode.offsetHeight / lineHeight);
        this.zone.layout(heightInLines);
    }

}
