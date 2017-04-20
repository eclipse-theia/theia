
import { Widget, Panel } from '@phosphor/widgets';
import { injectable } from "inversify";
import { DialogOptions, DialogService } from "../common/dialog-service";

@injectable()
export class DialogServiceImpl implements DialogService {

    private dialogs: {
        [id: string]: Dialog
    } = {}
    private dialogContainer: Panel

    createDialogContainer(): Panel {
        this.dialogContainer = new Panel()
        this.dialogContainer.id = 'theia:dialogcontainer'
        this.dialogs = {}
        return this.dialogContainer
    }

    createDialog(options: DialogOptions): void {
        if (this.dialogs[options.id]) {
            return
        }
        let dialog: Dialog = {
            id: options.id,
            title: (options.title) ? options.title : '',
            content: options.content,
            initCallback: options.initCallback,
            cancelCallback: options.cancelCallback,
            widget: new Widget(),
            visible: false
        }

        dialog.widget.addClass('dialogBlock');
        dialog.widget.node.innerHTML = (`
            <div id='dialogContainer-${options.id}' class='dialogWrapper'>
                <div class='dialogTitle'>${options.title}</div>
                <div class='dialogContent'>${options.content}</div>
                <i class="dialogClose fa fa-times" aria-hidden="true"></i>
            </div>
            `)

        this.dialogs[dialog.id] = dialog
        this.dialogContainer.addWidget(dialog.widget)
        dialog.initCallback()
        this.closeHandler(dialog.id)
    }

    removeDialog(id: string) {
        let item = this.dialogs[id];
        if (item) {
            this.hideDialog(id)
            item.widget.close()
            delete this.dialogs[id]
        }
    }

    hideDialog (id: string) {
        let dialog = this.dialogs[id]

        if (dialog && dialog.visible) {
            dialog.widget.addClass('hidden')
            dialog.visible = false
        }
    }

    showDialog (id: string) {
        let dialog = this.dialogs[id]

        if (dialog && !dialog.visible) {
            dialog.widget.removeClass('hidden')
            dialog.visible = true
        }
    }

    closeHandler (id: string) {
        let dialog = this.dialogs[id]
        let closeButton = document.querySelector(`#dialogContainer-${dialog.id} .dialogClose`)
        let keyboardListener = (e: KeyboardEvent) => {
            let isEscape = false
            if ("key" in e) {
                isEscape = (e.key === "Escape" || e.key === "Esc")
            } else {
                isEscape = (e.keyCode === 27)
            }
            if (isEscape) {
                dialog.cancelCallback()
                this.hideDialog(dialog.id)
                document.removeEventListener('keydown', keyboardListener)
            }
        }
        if (closeButton) {
            closeButton.addEventListener('click', (e: Event) => {
                dialog.cancelCallback()
                this.hideDialog(dialog.id)
                e.preventDefault()
                return false
            })
        }
        document.addEventListener('keydown', keyboardListener)
    }
}

export interface Dialog {
    id: string
    content: string
    initCallback: () => void
    cancelCallback: () => void
    title?: string
    widget: Widget
    visible: boolean
}