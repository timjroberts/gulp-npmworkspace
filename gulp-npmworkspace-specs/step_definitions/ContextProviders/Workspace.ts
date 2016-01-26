"use strict";

import * as path from "path";
import * as fs from "fs";
import * as jsonFile from "jsonfile";

import {ITemporaryWorkspace} from "./ITemporaryWorkspace";
import {WorkspacePackage} from "./WorkspacePackage";
import {WorkspaceChangeTracker} from "./WorkspaceChangeTracker";

/**
 * A managed temporary workspace that creates a temporary folder on disk that represents a
 * working Workspace.
 */
export class Workspace implements ITemporaryWorkspace {
    private _workspacePath: string;
    private _disposeFunc: Function;
    private _workspacePackages: Map<string, WorkspacePackage> = new Map<string, WorkspacePackage>();

    /**
     * Retrieves a change tracker that can be used to create and update workspace packages in the
     * current workspace.
     *
     * @returns A [[WorkspaceChangeTracker]] that can be used to update workspace packages.
     */
    public beginChanges(): WorkspaceChangeTracker {
        return new WorkspaceChangeTracker(this._workspacePackages);
    }

    /**
     * Applies tracked changes to the current workspace.
     *
     * @param changeTracker The [[WorkspaceChangeTracker]] that will have its changes applied
     * to the current workspace.
     */
    public applyChanges(changeTracker: WorkspaceChangeTracker): void {
        changeTracker.apply((trackedWorkspacePackage) => {
            let packagePath = path.join(this._workspacePath, trackedWorkspacePackage.path);

            if (!fs.existsSync(packagePath)) {
                fs.mkdirSync(packagePath);
            }

            jsonFile.writeFileSync(path.join(packagePath, "package.json"),
                                   (<any>trackedWorkspacePackage)._packageDescriptor,
                                   { spaces: 4 });

            if (this._workspacePackages.has(trackedWorkspacePackage.name)) {
                this._workspacePackages.set(trackedWorkspacePackage.name, new WorkspacePackage(trackedWorkspacePackage));
            }
        });
    }

    /**
     * Sets the temporary folder path.
     *
     * @param path The path to the folder representing the temporary workspace.
     * @param destroyFunc A funtion that when called, deletes the folder.
     */
    public setTemporaryFolderPath(path: string, destroyFunc: Function) {
        this._workspacePath = path;
        this._disposeFunc = destroyFunc;
    }

    /**
     * Disposes of the temporary workspace.
     */
    public dispose(): void {
        if (!this._disposeFunc) return;

        this._disposeFunc();
    }
}

export * from "./ITemporaryWorkspace";
