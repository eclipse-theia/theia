export const PopupService = Symbol("PopupService")

export interface PopupService {

    createPopup(options: PopupOptions): void
}

export interface PopupOptions {
    id: string
    content: string
    title?: string
}