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
        console.log(this.popupContainer)
        return this.popupContainer
    }

    createPopup(options: PopupOptions): void {
        let popup: Popup = {
            id: options.id,
            title: options.title,
            content: options.content,
            widget: new Widget(),
            visible: false
        }

        popup.widget.addClass('popupBlock');
        popup.widget.node.innerHTML = (`
            <div class='popupWrapper'>
                <div class='popupTitle'>${options.title}</div>
                <div class='popupContent'>${options.content}</div>
            </div>
            <div class='popupClose'>X</div>
            `)

        this.popups[popup.id] = popup
        console.log(this.popupContainer)
        this.popupContainer.addWidget(popup.widget)
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
}

export interface Popup {
    id: string
    content: string
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