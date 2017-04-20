export const DialogService = Symbol("DialogService")

export interface DialogService {

    createDialog(options: DialogOptions): void
    hideDialog(id: string): void
    showDialog(id: string): void
    removeDialog(id: string): void
    closeHandler(id: string): void
}

export interface DialogOptions {
    id: string
    content: string
    initCallback: () => void
    cancelCallback: () => void
    title?: string
}