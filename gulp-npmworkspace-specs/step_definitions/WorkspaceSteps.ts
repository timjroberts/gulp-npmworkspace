"use strict";

import * as assert from "assert";
import * as _ from "underscore";
import * as gulp from "gulp";
import * as through from "through2";
import {workspacePackages} from "gulp-npmworkspace";

import {Workspace} from "./ContextProviders/Workspace";
import {WorkspacePackage} from "./ContextProviders/WorkspacePackage";
import {PackageDescriptorStreamFactory, PackageDescriptorActionStreamFactory} from "./ContextProviders/StreamFactory";

/**
 * Populates a workspace with a set of packages and their dependencies.
 *
 * @param table A table defining the package name and their dependencies.
 */
async function populateWorkspaceWithPackages(table) {
    let workspace: Workspace = this["workspace"];

    let changeTracker = workspace.beginChanges();

    (<any[]>table.hashes()).forEach((row: Object) => {
        changeTracker.getWorkspacePackage(row["package"]).setDependencies(toDependencyDictionary(row["dependencies"]));
    });

    workspace.applyChanges(changeTracker);
}

/**
 * Streams the workspace packages in the current workspace.
 */
async function streamWorkspacePackages() {
    let workspace: Workspace = this["workspace"];

    this["workspacePackageStream"] = workspacePackages({ cwd: workspace.path });
}

/**
 * Ensures that the order of the streamed workspace packages are in the expected order.
 *
 * @param expectedPackageOrder A comma seperated string representing the names of the packages
 * and their order when streamed.
 */
async function assertStreamedPackageOrder(expectedPackageOrder: string) {
    let workspacePackageStream: NodeJS.ReadWriteStream = this["workspacePackageStream"];

    let collectedPackages: string[] = [ ];
    let collectorFunc = (packageDescriptor: any) => {
        collectedPackages.push(packageDescriptor.name);
    };

    workspacePackageStream = workspacePackageStream.pipe(new PackageDescriptorActionStreamFactory(collectorFunc).createStream());

    await PackageDescriptorStreamFactory.readStreamAsync(workspacePackageStream);

    let expectedPackages = _.map(expectedPackageOrder.split(","), (s) => s.trim() );

    assert.equal(collectedPackages.length, expectedPackages.length, `Expected ${expectedPackages.length} packages but got ${collectedPackages.length}.`);

    expectedPackages.forEach((expectedPackage, idx) => {
        let collectedPackage = collectedPackages[idx];

        assert.equal(collectedPackage, expectedPackage, `Expected package '${expectedPackage}' but got package '${collectedPackage}' (position ${idx}).`);
    });
}

function toDependencyDictionary(csvList: string): IDictionary<string> {
    let regex = /([\w|-]+)@?((?:\^|~)?(?:\d*)(?:\.?\d*)(?:\.?\d*))?/;

    return <IDictionary<string>>_.object(_.map(csvList.split(","), (csvEntry) => {
        let matches = regex.exec(csvEntry);

        if (!matches) return [ ];

        return [ matches[1], matches[2] || "*" ];
    }));
}

function WorkspaceSteps() {
    this.Given(/^a Workspace with:$/, populateWorkspaceWithPackages);
    this.When(/the workspace packages are streamed/, streamWorkspacePackages);
    this.Then(/^the order of the packages received is "([^"]*)"$/, assertStreamedPackageOrder);
}

export = WorkspaceSteps;
