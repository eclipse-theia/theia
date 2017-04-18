export const ClipboardService = Symbol("ClipboardService")

export interface ClipboardService {

    getData(format: string, type?: "" | "selection" | undefined): any
    isEmpty: boolean
    setData(data: any, type?: "" | "selection" | undefined): void
}