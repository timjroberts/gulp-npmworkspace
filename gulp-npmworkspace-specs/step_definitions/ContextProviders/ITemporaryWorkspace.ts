/**
 * Represents a temporary workspace.
 */
export interface ITemporaryWorkspace {
    /**
     * Sets the temporary folder path.
     *
     * @param path The path to the folder representing the temporary workspace.
     * @param destroyFunc A funtion that when called, deletes the folder.
     */
    setTemporaryFolderPath(path: string, destroyFunc: Function): void;

    /**
     * Disposes of the temporary workspace.
     */
    dispose(): void;
}
