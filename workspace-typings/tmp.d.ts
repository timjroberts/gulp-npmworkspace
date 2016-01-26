declare namespace Tmp {
    export interface X {
        unsafeCleanup?: boolean;
    }

    export type DirectoryOperationCallback = (error: Error, path: string, cleanupCallbcak: Function) => void;

    /**
     * Creates a temporary directory.
     *
     * @param options A hash of options.
     * @param callback A function that is called when the temporary directory has been created, or an
     * error occurs.
     */
    export function dir(options: X, callback: DirectoryOperationCallback): void;
}


declare module "tmp" {
    export = Tmp;
}