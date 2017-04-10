import { Path } from "../common/path";
import { FileSystem } from "../common/file-system";
import { PopupService } from "../../application/common/popup-service";

export function promtNamePopup(commandId: string, pathFrom: Path, popupService: PopupService, fileSystem: FileSystem): void {
    let submitButton: HTMLInputElement
    let inputText: HTMLInputElement
    let errorMessage: HTMLElement
    let parent: HTMLElement

    let isFree = true
    let isValid = true
    let resultName: Path | undefined

    popupService.createPopup({
        id: commandId,
        title: 'Enter new name',
        content: `
            <form class='changeNameInputContainer'>
                <input id='popupChangeNameInput' type=text value='' />
                <input id='popupChangeNameSubmit' type=submit value='Submit' />
                <div id='popupChangeErrorMessage'></div>
            </form>`,
        initCallback: () => {
            submitButton = <HTMLInputElement>document.getElementById('popupChangeNameSubmit')
            inputText = <HTMLInputElement>document.getElementById('popupChangeNameInput')
            errorMessage = <HTMLElement>document.getElementById('popupChangeErrorMessage')
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
                    parent.classList.remove('error')
                    popupService.hidePopup(commandId)
                    return
                }
                if (isValid && isFree && resultName) {
                    fileSystem.rename(pathFrom, resultName).then((success) => {
                        if (success) {
                            parent.classList.remove('error')
                            if (resultName && resultName.simpleName) {
                                inputText.value = resultName.simpleName
                            }
                            popupService.hidePopup(commandId)
                        } else {
                            parent.classList.add('error')
                            errorMessage.innerHTML = "Rename didn't work"
                        }
                        parent.classList.remove('valid')
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
    popupService.showPopup(commandId)
}