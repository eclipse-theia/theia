import { SelectionService, ClipboardSerivce } from '../../application/common';
import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, CommandHandler } from "../../application/common/command";
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { FileSystem } from "./file-system";
import { Path } from "./path";
import { PathSelection } from "./fs-selection";
import { PopupService } from "../../application/common";


export namespace Commands {
    export const FILE_MENU = "1_file";
    export const NEW_FILE = 'file:newFile';
    export const NEW_FOLDER = 'file:newFolder';
    export const FILE_OPEN = 'file:open';
    export const FILE_CUT = 'file:fileCut';
    export const FILE_COPY = 'file:fileCopy';
    export const FILE_PASTE = 'file:filePaste';
    export const FILE_RENAME = 'file:fileRename';
    export const FILE_DELETE = 'file:fileDelete';
}

@injectable()
export class FileMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
            // Explicitly register the Edit Submenu
            registry.registerSubmenu([MAIN_MENU_BAR], Commands.FILE_MENU, "File");

            registry.registerMenuAction([MAIN_MENU_BAR, Commands.FILE_MENU, "1_new"], {
                commandId: Commands.NEW_FILE
            });
            registry.registerMenuAction([MAIN_MENU_BAR, Commands.FILE_MENU, "1_new"], {
                commandId: Commands.NEW_FOLDER
            });
            registry.registerMenuAction([MAIN_MENU_BAR, Commands.FILE_MENU, "2_open"], {
                commandId: Commands.FILE_OPEN
            });
        }
}

@injectable()
export class FileCommandContribution implements CommandContribution {
    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(ClipboardSerivce) protected readonly clipboardService: ClipboardSerivce,
        @inject(PopupService) protected readonly popupService: PopupService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        ) {}

    contribute(registry: CommandRegistry): void {
        registry.registerCommand({
            id: Commands.NEW_FILE,
            label: 'New File'
        });
        registry.registerCommand({
            id: Commands.NEW_FOLDER,
            label: 'New Folder'
        });
        registry.registerCommand({
            id: Commands.FILE_OPEN,
            label: 'Open ...'
        });
        registry.registerCommand({
            id: Commands.FILE_CUT,
            label: 'Cut'
        });
        registry.registerCommand({
            id: Commands.FILE_COPY,
            label: 'Copy'
        });
        registry.registerCommand({
            id: Commands.FILE_PASTE,
            label: 'Paste'
        });
        registry.registerCommand({
            id: Commands.FILE_RENAME,
            label: 'Rename'
        });
        registry.registerCommand({
            id: Commands.FILE_DELETE,
            label: 'Delete'
        });

        registry.registerHandler(
            Commands.FILE_RENAME,
            new FileSystemCommandHandler({
                id: Commands.FILE_RENAME,
                actionId: 'renamefile',
                selectionService: this.selectionService,
                popupService: this.popupService
            }, (path: Path) => {
                this.popupService.createPopup({
                    id: 'rename',
                    title: 'Enter new name',
                    content: `
                        <form class='changeNameInputContainer'>
                            <input id='popupChangeNameInput' type=text value='' />
                            <input id='popupChangeNameSubmit' type=submit value='Submit' />
                            <div id='popupChangeErrorMessage'></div>
                        </form>`,
                    initCallback: () => {
                        let submitButton = <HTMLInputElement>document.getElementById('popupChangeNameSubmit')
                        let inputText = <HTMLInputElement>document.getElementById('popupChangeNameInput')
                        let errorMessage = <HTMLElement>document.getElementById('popupChangeErrorMessage')
                        if (!submitButton || !inputText || !errorMessage) {
                            return false
                        }
                        let parent = <HTMLElement>inputText.parentElement

                        if (!parent) {
                            return false
                        }

                        let isFree = false
                        let isValid = false
                        let resultName: Path | undefined
                        let cancelHandler = (e: KeyboardEvent) => {
                            let isEscape = false
                            if ("key" in e) {
                                isEscape = (e.key === "Escape" || e.key === "Esc")
                            } else {
                                isEscape = (e.keyCode === 27)
                            }
                            if (isEscape) {
                                inputText.value = path.segments[path.segments.length - 1]
                                this.popupService.hidePopup('rename')
                                document.removeEventListener('keydown', cancelHandler)
                            }
                        }
                        let validationHandler = (el: HTMLInputElement, parent: HTMLElement) => {
                            if (!el.value.match(/^[\w\-. ]+$/)) {
                                parent.classList.add('error')
                                errorMessage.innerHTML = "Invalid name, try other"
                                isValid = false
                            } else {
                                parent.classList.remove('error')
                                isValid = true
                                let fsNameTest: Path = path.parent.append(el.value)
                                // 'trying to check name existance'
                                this.fileSystem.exists(fsNameTest).then((doExist: boolean) => {
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
                            if (isValid && isFree && resultName) {
                                this.fileSystem.rename(path, resultName).then((success) => {
                                    if (success) {
                                        parent.classList.remove('error')
                                        if (resultName) {
                                            inputText.value = resultName.segments[resultName.segments.length - 1]
                                        }
                                        this.popupService.hidePopup('rename')
                                    } else {
                                        parent.classList.add('error')
                                        errorMessage.innerHTML = "Rename didn't work"
                                    }
                                    parent.classList.remove('valid')
                                }).catch((error) => {
                                    if (error) {
                                        parent.classList.add('error')
                                        errorMessage.innerHTML = `Rename failed with message: ${error}`
                                    }
                                })
                            }
                        }

                        inputText.addEventListener('input', (e: Event) => {
                            if (inputText instanceof HTMLInputElement && parent instanceof HTMLElement) {
                                validationHandler(inputText, parent)
                            }
                        })

                        parent.addEventListener('submit', (e: Event) => {
                            submitHandler()
                            e.preventDefault()
                            return false
                        })

                        inputText.focus()
                        inputText.value = path.segments[path.segments.length - 1]
                    },
                    cancelCallback: () => {
                        
                    }
                })
                this.popupService.showPopup('rename')
                return Promise.resolve()
            })
        );

        registry.registerHandler(
            Commands.FILE_COPY,
            new FileSystemCommandHandler({
                id: Commands.FILE_COPY,
                actionId: 'copyfile',
                selectionService: this.selectionService
            }, (path: Path) => {
                this.clipboardService.setData({
                    type: 'path',
                    path: path.toString()
                })
                return Promise.resolve()
            })
        );

        registry.registerHandler(
            Commands.FILE_PASTE,
            new FileSystemCommandHandler({
                id: Commands.FILE_PASTE,
                actionId: 'pastefile',
                selectionService: this.selectionService,
                clipboardService: this.clipboardService
            }, (pastePath: Path) => {
                let isFolder = true;
                let copyPath: Path
                return this.fileSystem.dirExists(pastePath)
                .then((targetFolderExists: boolean) => {
                    if (!targetFolderExists) {
                        // 'paste path is not folder'
                        isFolder = false;
                        pastePath = pastePath.parent
                    }
                    return this.fileSystem.dirExists(pastePath)
                })
                .then((targetFolderExists: boolean) => {
                    if (!targetFolderExists) {
                        return Promise.reject("paste path dont exist")
                    }
                    let data: any = this.clipboardService.getData
                    copyPath = Path.fromString(data.path)
                    pastePath = pastePath.append(copyPath.segments[copyPath.segments.length - 1])
                    return this.fileSystem.cp(copyPath, pastePath)
                })
            })
        );

        registry.registerHandler(
            Commands.NEW_FILE,
            new FileSystemCommandHandler({
                id: Commands.NEW_FILE,
                actionId: 'newfile',
                selectionService: this.selectionService
            }, (path: Path) => {
                return this.fileSystem.createName(path)
                .then((newPathData: string) => {
                    const newPath = Path.fromString(newPathData)
                    return this.fileSystem.writeFile(newPath, "")
                })
            })
        );

        registry.registerHandler(
            Commands.NEW_FOLDER,
            new FileSystemCommandHandler({
                id: Commands.NEW_FOLDER,
                actionId: 'newfolder',
                selectionService: this.selectionService
            }, (path: Path) => {
                return this.fileSystem.createName(path)
                .then((newPathData: string) => {
                    const newPath = Path.fromString(newPathData)
                    return this.fileSystem.mkdir(newPath)
                })
            })
        );

        registry.registerHandler(
            Commands.FILE_DELETE,
            new FileSystemCommandHandler({
                id: Commands.FILE_DELETE,
                actionId: 'delete',
                selectionService: this.selectionService
            }, (path: Path) => {
                return this.fileSystem.dirExists(path)
                .then((isDir) => {
                    if (isDir) {
                        return this.fileSystem.rmdir(path)
                    }
                    return this.fileSystem.rm(path)
                })
            })
        );
    }
}

export class FileSystemCommandHandler implements CommandHandler {
    constructor(
        protected readonly options: FileSystemCommandHandler.Options,
        protected readonly doExecute: (path: Path) => Promise<any>) {
    }

    execute(arg?: any): Promise<any> {
        const selection = this.options.selectionService.selection;
        if (PathSelection.is(selection)) {
            return this.doExecute(selection.path)
        }
        return Promise.resolve()
    }

    isVisible(arg?: any): boolean {
        if (PathSelection.is(this.options.selectionService.selection)) {
            return true;
        }
        return false;
    }

    isEnabled(arg?: any): boolean {
        if (this.options.actionId === 'pastefile') {
            if (!this.options.clipboardService) {
                return false
            }
            if (this.options.clipboardService.isEmpty) {
                return false
            }
            let data: any = this.options.clipboardService.getData
            if (data.type !== "path") {
                return false
            }
        }
        return true;
    }

}

export namespace FileSystemCommandHandler {
    export interface Options {
        id: string;
        actionId: string,
        selectionService: SelectionService,
        clipboardService?: ClipboardSerivce
        popupService?: PopupService
    }
}