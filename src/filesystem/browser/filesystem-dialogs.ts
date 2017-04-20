import { Path } from "../common/path";
import { FileSystem } from "../common/filesystem";
import { DialogService } from "../../application/common/dialog-service";

export function promptNameDialog(commandId: string, pathFrom: Path, dialogService: DialogService, fileSystem: FileSystem): void {
    let submitButton: HTMLInputElement
    let inputText: HTMLInputElement
    let errorMessage: HTMLElement
    let parent: HTMLElement

    let isFree = true
    let isValid = true
    let resultName: Path | undefined

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
                if (inputText.value === pathFrom.simpleName) {
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
                    let fsNameTest: Path = pathFrom.parent.append(inputText.value)
                    // 'trying to check name existance'
                    fileSystem.exists(fsNameTest).then((doExist: boolean) => {
                        if (doExist) {
                            // 'name does exist'
                            parent.classList.add('error')
                            parent.classList.remove('valid')
                            errorMessage.innerHTML = "This name is already exist"
                            submitButton.disabled = true
                        } else {
                            // 'can create new name'
                            parent.classList.remove('error')
                            parent.classList.add('valid')
                            submitButton.disabled = false
                            resultName = fsNameTest
                        }
                        isFree = !doExist
                    })
                }
            }
            let submitHandler = () => {
                if (inputText.value === pathFrom.simpleName && !resultName) {
                    dialogService.removeDialog(commandId)
                    return
                }
                if (isValid && isFree && resultName) {
                    fileSystem.rename(pathFrom, resultName).then((success) => {
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
            if (pathFrom.simpleName) {
                inputText.value = pathFrom.simpleName
            }
        },
        cancelCallback: () => {
            isFree = false
            isValid = false
            parent.classList.remove('error')
            parent.classList.remove('valid')
            if (resultName && resultName.simpleName) {
                inputText.value = resultName.simpleName
            } else if (pathFrom && pathFrom.simpleName) {
                inputText.value = pathFrom.simpleName
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