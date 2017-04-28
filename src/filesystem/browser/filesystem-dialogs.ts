import { FileSystem } from "../common/filesystem";
import { DialogService } from "../../application/common/dialog-service";
import URI from "../../application/common/uri";

export function promptNameDialog(commandId: string, pathFrom: string, dialogService: DialogService, fileSystem: FileSystem): void {
    let submitButton: HTMLInputElement
    let inputText: HTMLInputElement
    let errorMessage: HTMLElement
    let parent: HTMLElement

    let isFree = true
    let isValid = true
    let resultName: string | undefined
    let uri = new URI(pathFrom)
    let containingFolder = uri.parent()

    dialogService.createDialog({
        id: commandId,
        title: 'Enter new name',
        content: `
            <form class='changeNameInputContainer'>
                <input class='dialogButton' id='dialogChangeNameInput' type=text value='' />
                <input class='dialogButton main' id='dialogChangeNameSubmit' type=submit value='Submit' />
                <div id='dialogChangeErrorMessage'></div>
            </form>`,
        initCallback: () => {
            submitButton = <HTMLInputElement>document.getElementById('dialogChangeNameSubmit')
            inputText = <HTMLInputElement>document.getElementById('dialogChangeNameInput')
            errorMessage = <HTMLElement>document.getElementById('dialogChangeErrorMessage')
            if (!submitButton || !inputText || !errorMessage) {
                return false
            }
            parent = <HTMLElement>inputText.parentElement

            if (!parent) {
                return false
            }
            let validationHandler = () => {
                if (inputText.value === new URI(pathFrom).lastSegment()) {
                    parent.classList.remove('error')
                    isValid = true
                    isFree = true
                }
                if (!inputText.value.match(/^[\w\-. ]+$/)) {
                    parent.classList.add('error')
                    errorMessage.innerHTML = "Invalid name, try other"
                    isValid = false
                } else {
                    parent.classList.remove('error')
                    isValid = true
                    let fsNameTest = containingFolder.append(inputText.value)
                    // 'trying to check name existance'
                    fileSystem.getFileStat(fsNameTest.toString()).then((stat) => {
                        // 'name does exist'
                        parent.classList.add('error')
                        parent.classList.remove('valid')
                        errorMessage.innerHTML = "This name is already exist"
                        submitButton.disabled = true
                    }).catch( err => {
                        // 'can create new name'
                        parent.classList.remove('error')
                        parent.classList.add('valid')
                        submitButton.disabled = false
                    })
                }
            }
            let submitHandler = () => {
                if (inputText.value === uri.lastSegment() && !resultName) {
                    dialogService.removeDialog(commandId)
                    return
                }
                if (isValid && isFree && resultName) {
                    fileSystem.move(pathFrom, resultName).then((success) => {
                        if (success) {
                            dialogService.removeDialog(commandId)
                        } else {
                            parent.classList.remove('valid')
                            parent.classList.add('error')
                            errorMessage.innerHTML = "Rename didn't work"
                        }
                    }).catch((error) => {
                        if (error) {
                            parent.classList.add('error')
                            errorMessage.innerHTML = `${commandId} failed with message: ${error}`
                        }
                    })
                }
            }

            inputText.addEventListener('input', (e: Event) => {
                if (inputText instanceof HTMLInputElement && parent instanceof HTMLElement) {
                    validationHandler()
                }
            })

            parent.addEventListener('submit', (e: Event) => {
                submitHandler()
                e.preventDefault()
                return false
            })

            inputText.focus()
            if (uri.lastSegment()) {
                inputText.value = uri.lastSegment()
            }
        },
        cancelCallback: () => {
            isFree = false
            isValid = false
            parent.classList.remove('error')
            parent.classList.remove('valid')
            if (resultName && uri.lastSegment()) {
                inputText.value = uri.lastSegment()
            } else if (pathFrom && uri.lastSegment()) {
                inputText.value = uri.lastSegment()
            }
        }
    })
    dialogService.showDialog(commandId)
}

export function promptConfirmDialog(commandId: string, actionCallback: any, dialogService: DialogService, fileSystem: FileSystem): void {
    dialogService.createDialog({
        id: commandId,
        title: 'Confirm the action',
        content: `
            <form class='confirmInputContainer'>
                <input class='dialogButton' id='dialogConfirmCancel' type=submit value='Cancel' />
                <input class='dialogButton main' id='dialogConfirmSubmit' type=submit value='Confirm' />
            </form>`,
        initCallback: () => {
            const submitButton = <HTMLInputElement>document.getElementById('dialogConfirmSubmit')
            const cancelButton = <HTMLInputElement>document.getElementById('dialogConfirmCancel')

            if (!submitButton || !cancelButton) {
                return false
            }

            submitButton.addEventListener('click', (e: Event) => {
                actionCallback()
                dialogService.removeDialog(commandId)
            })

            cancelButton.addEventListener('click', (e: Event) => {
                dialogService.removeDialog(commandId)
            })
            submitButton.focus()
        },
        cancelCallback: () => {
            dialogService.removeDialog(commandId)
        }
    })
    dialogService.showDialog(commandId)
}