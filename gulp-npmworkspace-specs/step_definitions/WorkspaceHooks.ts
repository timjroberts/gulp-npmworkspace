"use strict";

import * as tmp from "tmp";

import {Workspace, ITemporaryWorkspace} from "./ContextProviders/Workspace";


type TemporaryDirectoryInfo = { path: string, cleanupAction: Function };


function WorkspaceHooks() {
    this.Before("@requiresWorkspace", async function() {
        let directoryInfo = await createTemporaryDirectoryAsync();
        let workspace: ITemporaryWorkspace = this["workspace"] = new Workspace();

        workspace.setTemporaryFolderPath(directoryInfo.path, directoryInfo.cleanupAction);
    });

    this.After("@requiresWorkspace", async function() {
        let workspace: ITemporaryWorkspace = this["workspace"];

        workspace.dispose();
    });
}


async function createTemporaryDirectoryAsync(): Promise<TemporaryDirectoryInfo> {
    return new Promise<TemporaryDirectoryInfo>((resolve, reject) => {
        tmp.dir({ unsafeCleanup: true }, (error, path, cleanupAction) => {
            if (error) reject(error);

            resolve({ path: path, cleanupAction: cleanupAction });
        });
    });
}


export = WorkspaceHooks;
