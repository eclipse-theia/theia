import {ITreeModel, ITreeNode} from "./tree/model";
import {Emitter, Event} from "@theia/platform-common";

export class FileNavigatorModel implements ITreeModel {

    protected readonly onChangedEmitter = new Emitter<void>();

    get onChanged(): Event<void> {
        return this.onChangedEmitter.event;
    }

    get root(): ITreeNode {
        return {
            name: 'Root',
            parent: undefined
        }
    }


}