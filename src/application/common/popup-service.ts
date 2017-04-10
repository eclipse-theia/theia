export const PopupService = Symbol("PopupService")

export interface PopupService {

    createPopup(options: PopupOptions): void
    hidePopup(id: string): void
    showPopup(id: string): void
    closeHandler(id: string): void
}

export interface PopupOptions {
    id: string
    content: string
    initCallback: () => void
    cancelCallback: () => void
    title?: string
}