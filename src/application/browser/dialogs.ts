/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */


import { Widget } from '@phosphor/widgets';

export class Dialog<T> {

    accept: (value?: T) => void
    reject: () => void

    readonly acceptancePromise = new Promise<T>((resolve, reject) => {
        this.accept = (value) => {
            Widget.detach(this.widget)
            resolve(value)
        }
        this.reject = () => {
            Widget.detach(this.widget)
            reject()
        }
    })

    titleNode: HTMLDivElement;
    contentNode: HTMLDivElement;
    closeCrossNode: HTMLElement;

    protected widget: Widget

    constructor(title: string) {
        this.widget = new Widget(document.createElement("div"))
        this.widget.addClass('dialogBlock')

        let wrapper = document.createElement("div")
        wrapper.classList.add('dialogWrapper')
        this.widget.node.appendChild(wrapper)
        this.titleNode = document.createElement("div")
        this.titleNode.classList.add('dialogTitle')
        this.titleNode.textContent = title
        wrapper.appendChild(this.titleNode)

        this.contentNode = document.createElement("div")
        this.contentNode.classList.add('dialogContent')
        wrapper.appendChild(this.contentNode)

        this.closeCrossNode = document.createElement("i")
        this.closeCrossNode.classList.add('dialogClose')
        this.closeCrossNode.classList.add('fa')
        this.closeCrossNode.classList.add('fa-times')
        this.closeCrossNode.setAttribute('aria-hidden', 'true')
        wrapper.appendChild(this.closeCrossNode)

        this.attachListeners()
        this.show()
    }

    protected attachListeners() {
        let closeButton = this.closeCrossNode
        closeButton.addEventListener('click', (e: Event) => {
            this.reject()
            e.preventDefault()
            return false
        })
        this.widget.node.addEventListener('keydown', (e: KeyboardEvent) => {
            let isEscape = false
            let isEnter = false
            if ("key" in e) {
                isEscape = (e.key === "Escape" || e.key === "Esc")
                isEnter = e.key === "Enter"
            } else {
                isEscape = (e.keyCode === 27)
                isEnter = (e.keyCode === 13)
            }
            if (isEscape) {
                this.reject()
            } else if (isEnter) {
                this.accept()
            }
        })
    }

    show() {
        if (!this.widget.isAttached) {
            Widget.attach(this.widget, document.body)
        }
    }

}

export class ConfirmDialog extends Dialog<void> {
    okButton: HTMLButtonElement;
    cancelButton: HTMLButtonElement;

    constructor(title: string, msg: string, cancel = 'Cancel', ok = 'OK') {
        super(title)

        const cancelButton = document.createElement("button")
        cancelButton.classList.add('dialogButton')
        cancelButton.textContent = cancel
        cancelButton.setAttribute('style', 'flex: 1 20%;')
        cancelButton.addEventListener('click', event => this.reject())
        this.contentNode.appendChild(cancelButton)

        const okButton = document.createElement("button")
        okButton.classList.add('dialogButton')
        okButton.classList.add('main')
        okButton.textContent = ok
        okButton.setAttribute('style', 'flex: 1 20%;')
        okButton.addEventListener('click', event => this.accept())
        okButton.focus()

        this.contentNode.appendChild(okButton)
        okButton.focus()
    }

}

export namespace SingleTextInputDialog {
    export interface Options {
        confirmButtonLabel?: string,
        initialValue?: string,
        validate?(input: string): string
    }
}

export class SingleTextInputDialog extends Dialog<string> {
    errorMessageNode: HTMLDivElement;

    inputField: HTMLInputElement;
    okButton: HTMLButtonElement;

    constructor(title: string, options: SingleTextInputDialog.Options) {
        super(title)

        this.inputField = document.createElement("input")
        this.inputField.classList.add('dialogButton')
        this.inputField.type = 'text'
        this.inputField.setAttribute('style', 'flex: 1 auto;')
        this.inputField.value = options.initialValue || ''
        if (options.validate) {
            this.inputField.addEventListener('input', event => {
                let msg = options.validate!(this.inputField.value)
                this.setErrorMessage(msg)
            })
        }
        this.contentNode.appendChild(this.inputField)

        this.okButton = document.createElement("button")
        this.okButton.classList.add('dialogButton')
        this.okButton.classList.add('main')
        this.okButton.setAttribute('style', 'flex: 1 20%;')
        this.okButton.textContent = options.confirmButtonLabel || 'OK'
        this.okButton.addEventListener('click', event => this.accept(this.inputField.value))

        this.contentNode.appendChild(this.okButton)

        this.errorMessageNode = document.createElement("div")
        this.errorMessageNode.setAttribute('style', 'flex: 1 100%;')

        this.contentNode.appendChild(this.errorMessageNode)
        this.inputField.focus()
        this.inputField.select()

        const oldAccept = this.accept
        this.accept = () => {
            if (!this.okButton.disabled) {
                oldAccept(this.inputField.value)
            }
        }
    }

    private setErrorMessage(msg: string) {
        if (msg) {
            this.widget.node.classList.add('error')
            this.errorMessageNode.innerHTML = msg
            this.okButton.disabled = true
        } else {
            this.widget.node.classList.remove('error')
            this.errorMessageNode.innerHTML = msg
            this.okButton.disabled = false
        }
    }

}