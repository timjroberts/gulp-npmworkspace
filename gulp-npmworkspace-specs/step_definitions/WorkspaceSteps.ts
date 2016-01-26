"use strict";

import {Workspace} from "./ContextProviders/Workspace";
import {WorkspacePackage} from "./ContextProviders/WorkspacePackage";

function WorkspaceSteps() {
    this.Given(/^a Workspace with:$/, async function(table) {
        let workspace: Workspace = this["workspace"];

        let changeTracker = workspace.beginChanges();

        (<any[]>table.hashes()).forEach((row: Object) => {
            console.log(`${row["package"]} - ${row["dependencies"]}`);

            changeTracker.getWorkspacePackage(row["package"]).setDependencies({ "d": "1.0.0", "e": "1.0.0" });
        });

        workspace.applyChanges(changeTracker);
    });
}

export = WorkspaceSteps;
