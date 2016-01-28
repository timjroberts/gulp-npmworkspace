"use strict";

import * as tmp from "tmp";

import {Workspace, ITemporaryWorkspace} from "./ContextProviders/Workspace";

type TemporaryDirectoryInfo = { path: string, cleanupAction: Function };

/**
 * An asynchronous wrapper around tmp.dir().
 */
async function createTemporaryDirectoryAsync(): Promise<TemporaryDirectoryInfo> {
    return new Promise<TemporaryDirectoryInfo>((resolve, reject) => {
        tmp.dir({ unsafeCleanup: true }, (error, path, cleanupAction) => {
            if (error) reject(error);

            resolve({ path: path, cleanupAction: cleanupAction });
        });
    });
}

/**
 * Creates a temporary workspace.
 */
async function createTemporaryWorkspace() {
    let directoryInfo = await createTemporaryDirectoryAsync();
    let workspace: ITemporaryWorkspace = this["workspace"] = new Workspace();

    workspace.setTemporaryFolderPath(directoryInfo.path, directoryInfo.cleanupAction);
}

/**
 * Destroys any existing temporary workspace.
 */
async function destroyTemporaryWorkspace() {
    let workspace: ITemporaryWorkspace = this["workspace"];

    if (workspace) {
        workspace.dispose();
    }
}


function WorkspaceHooks() {
    this.Before("@requiresWorkspace", createTemporaryWorkspace);
    this.After("@requiresWorkspace", destroyTemporaryWorkspace);
}

export = WorkspaceHooks;
