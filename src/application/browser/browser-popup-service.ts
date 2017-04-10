import { TheiaPlugin, TheiaApplication } from '../../application/browser';
import { Widget, Panel } from '@phosphor/widgets';
import { injectable, inject } from "inversify";
import { PopupOptions, PopupService } from "../common/popup-service";

@injectable()
export class BrowserPopupService implements PopupService {

    private popups: {
        [id: string]: Popup
    } = {}
    private popupContainer: Panel

    createPopupContainer(): Panel {
        this.popupContainer = new Panel()
        this.popupContainer.id = 'theia:popupcontainer'
        this.popups = {}
        return this.popupContainer
    }

    createPopup(options: PopupOptions): void {
        if (this.popups[options.id]) {
            return
        }
        let popup: Popup = {
            id: options.id,
            title: (options.title) ? options.title : '',
            content: options.content,
            initCallback: options.initCallback,
            cancelCallback: options.cancelCallback,
            widget: new Widget(),
            visible: false
        }

        popup.widget.addClass('popupBlock');
        popup.widget.node.innerHTML = (`
            <div id='popupContainer-${options.id}' class='popupWrapper'>
                <div class='popupTitle'>${options.title}</div>
                <div class='popupContent'>${options.content}</div>
                <i class="popupClose fa fa-times" aria-hidden="true"></i>
            </div>
            `)

        this.popups[popup.id] = popup
        this.popupContainer.addWidget(popup.widget)
        popup.initCallback()
        this.closeHandler(popup.id)
    }

    hidePopup (id: string) {
        let popup = this.popups[id]

        if (popup && popup.visible) {
            popup.widget.addClass('hidden')
            popup.visible = false
        }
    }

    showPopup (id: string) {
        let popup = this.popups[id]

        if (popup && !popup.visible) {
            popup.widget.removeClass('hidden')
            popup.visible = true
        }
    }

    closeHandler (id: string) {
        let popup = this.popups[id]
        let closeButton = document.querySelector(`#popupContainer-${popup.id} .popupClose`)
        let keyboardListener = (e: KeyboardEvent) => {
            let isEscape = false
            if ("key" in e) {
                isEscape = (e.key === "Escape" || e.key === "Esc")
            } else {
                isEscape = (e.keyCode === 27)
            }
            if (isEscape) {
                popup.cancelCallback()
                this.hidePopup(popup.id)
                document.removeEventListener('keydown', keyboardListener)
            }
        }
        if (closeButton) {
            closeButton.addEventListener('click', (e: Event) => {
                popup.cancelCallback()
                this.hidePopup(popup.id)
                e.preventDefault()
                return false
            })
        }
        document.addEventListener('keydown', keyboardListener)
    }
}

export interface Popup {
    id: string
    content: string
    initCallback: () => void
    cancelCallback: () => void
    title?: string
    widget: Widget
    visible: boolean
}

@injectable()
export class BrowserPopupContribution implements TheiaPlugin {

    constructor(@inject(BrowserPopupService) private popupService: BrowserPopupService) {}

    onStart(app: TheiaApplication): void {
        app.shell.addToMainArea(this.popupService.createPopupContainer());
    }

}