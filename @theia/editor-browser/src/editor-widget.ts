import {ElementExt} from "@phosphor/domutils";
import {Widget} from "@phosphor/widgets";
import {Message} from "@phosphor/messaging";
import {DisposableCollection} from "@theia/platform-common";
import IEditorConstructionOptions = monaco.editor.IEditorConstructionOptions;
import IEditorOverrideServices = monaco.editor.IEditorOverrideServices;
import IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
import IDimension = monaco.editor.IDimension;
import IBoxSizing = ElementExt.IBoxSizing;

export namespace EditorWidget {
    export interface IOptions extends IEditorConstructionOptions {
        /**
         * Whether an editor should be auto resized on a content change.
         *
         * #### Fixme
         * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
         */
        autoSizing?: boolean;
        /**
         * A minimal height of an editor.
         *
         * #### Fixme
         * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
         */
        minHeight?: number;
    }
}

export class EditorWidget extends Widget implements EventListenerObject {

    protected readonly autoSizing: boolean;
    protected readonly minHeight: number;
    protected readonly editor: IStandaloneCodeEditor;
    protected readonly toDispose = new DisposableCollection();

    protected _needsRefresh = true;
    protected _needsResize = false;
    protected _resizing = -1;

    constructor(options?: EditorWidget.IOptions, override?: IEditorOverrideServices) {
        super();
        this.autoSizing = options && options.autoSizing !== undefined ? options.autoSizing : false;
        this.minHeight = options && options.minHeight !== undefined ? options.minHeight : -1;
        this.toDispose.push(this.editor = monaco.editor.create(this.node, options, override));
        this.toDispose.push(this.editor.onDidChangeConfiguration(e => this.refresh()));
        this.toDispose.push(this.editor.onDidChangeModel(e => this.refresh()));
        this.toDispose.push(this.editor.onDidChangeModelContent(() => this.refresh()));
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }
        clearTimeout(this._resizing);
        super.dispose();
        this.editor.dispose();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.editor.focus();
    }

    protected onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.dispose();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.node.addEventListener('focus', this, true);
        if (!this.isVisible) {
            this._needsRefresh = true;
            return;
        }
        this.refresh();
        this._needsRefresh = false;
    }

    protected onBeforeDetach(msg: Message): void {
        this.node.removeEventListener('focus', this, true);
    }

    protected onAfterShow(msg: Message): void {
        if (this._needsRefresh) {
            this.refresh();
            this._needsRefresh = false;
        }
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        if (msg.width < 0 || msg.height < 0) {
            if (this._resizing === -1) {
                this.resize(null);
                this._resizing = window.setTimeout(() => {
                    if (this._needsResize) {
                        this.resize(null);
                        this._needsResize = false;
                    }
                    this._resizing = -1;
                }, 500);
            } else {
                this._needsResize = true;
            }
        } else {
            this.resize(msg);
        }
        this._needsRefresh = true;
    }

    handleEvent(event: Event): void {
        if (event.type === 'focus') {
            if (this._needsRefresh) {
                this.refresh();
                this._needsRefresh = false;
            }
        }
    }

    protected refresh(): void {
        if (this.autoSizing) {
            this.resize(null);
        }
    }

    protected resize(dimension: IDimension | null): void {
        if (this.node) {
            const layoutSize = this.computeLayoutSize(this.node, dimension);
            this.editor.layout(layoutSize);
        }
    }

    protected computeLayoutSize(hostNode: HTMLElement, dimension: monaco.editor.IDimension |  null): monaco.editor.IDimension {
        if (dimension && dimension.width >= 0 && dimension.height >= 0) {
            return dimension;
        }
        const boxSizing = ElementExt.boxSizing(hostNode);

        const width = (!dimension || dimension.width < 0) ?
            this.getWidth(hostNode, boxSizing) :
            dimension.width;

        const height = (!dimension || dimension.height < 0) ?
            this.getHeight(hostNode, boxSizing) :
            dimension.height;

        return {width, height};
    }

    protected getWidth(hostNode: HTMLElement, boxSizing: IBoxSizing): number {
        return hostNode.offsetWidth - boxSizing.horizontalSum;
    }

    protected getHeight(hostNode: HTMLElement, boxSizing: IBoxSizing): number {
        if (!this.autoSizing) {
            return hostNode.offsetHeight - boxSizing.verticalSum;
        }
        const configuration = this.editor.getConfiguration();

        const lineHeight = configuration.lineHeight;
        const lineCount = this.editor.getModel().getLineCount();
        const contentHeight = lineHeight * lineCount;

        const horizontalScrollbarHeight = configuration.layoutInfo.horizontalScrollbarHeight;

        const editorHeight = contentHeight + horizontalScrollbarHeight;
        if (this.minHeight < 0) {
            return editorHeight;
        }
        const defaultHeight = lineHeight * this.minHeight + horizontalScrollbarHeight;
        return Math.max(defaultHeight, editorHeight);
    }

}
