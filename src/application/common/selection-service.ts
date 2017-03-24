import { Disposable } from "../common";
import { injectable } from "inversify";

export type SelectionListener = (newSelection: any) => void;

@injectable()
export class SelectionService {

    constructor() { }

    private currentSelection: any;
    private selectionListeners: SelectionListener[] = [];

    /**
     * setSelection
     */
    public setSelection(selection: any) {
        this.currentSelection = selection;
        for (let listener of this.selectionListeners) {
            listener(this.currentSelection);
        }
    }

    public addSelectionListener(listener: SelectionListener): Disposable {
        this.selectionListeners.push(listener);
        let dispose = () => this.selectionListeners = this.selectionListeners.filter((e: SelectionListener) => e !== listener);
        return {
            dispose
        };
    }
}