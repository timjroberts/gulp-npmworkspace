"use strict";

import * as assert from "assert";
import * as _ from "underscore";
import * as gulp from "gulp";
import * as through from "through2";
import {workspacePackages, filter} from "gulp-npmworkspace";

import {Workspace} from "./ContextProviders/Workspace";
import {WorkspacePackage} from "./ContextProviders/WorkspacePackage";
import {PackageDescriptorStreamFactory, PackageDescriptorStreamActionFactory} from "./ContextProviders/StreamFactory";

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

    this["workspacePackageStream"] = workspacePackages({ cwd: workspace.path, enableLogging: false });
}

/**
 * Streams the workspace packages in the current workspace and applies a filter that removes packages
 * that don't have a given set of dependencies.
 *
 * @param dependencies A comma seperated string representing the names of the dependencies that should
 * be applied in the filter.
 */
async function streamWorkspacePackagesWithDependencyFilter(dependencies: string) {
    let workspace: Workspace = this["workspace"];

    let requiredDependencies = toDependencyDictionary(dependencies);

    this["workspacePackageStream"] = workspacePackages({ cwd: workspace.path, enableLogging: true })
                                     .pipe(filter((packageDescriptor) => {
                                         debugger;

                                         for (let requiredDependency in requiredDependencies) {
                                             if (!(packageDescriptor.dependencies && packageDescriptor.dependencies[requiredDependency])
                                                 && !(packageDescriptor.devDependencies && packageDescriptor.devDependencies[requiredDependency])) {
                                                     return false;
                                                 }
                                         }

                                         return true;
                                     }));
}

/**
 * Ensures that the order of the streamed workspace packages are in the expected order.
 *

 * @param expectedPackageOrder A comma seperated string representing the names of the packages
 * and their order when streamed.
 */
async function assertStreamedPackageOrder(expectedPackageOrder: string) {
    let collectedPackages = await pullPackages(this);

    let expectedPackages = _.map(expectedPackageOrder.split(","), (s) => s.trim() );

    assert.equal(collectedPackages.length, expectedPackages.length, `Expected ${expectedPackages.length} packages but got ${collectedPackages.length}.`);

    expectedPackages.forEach((expectedPackage, idx) => {
        let collectedPackage = collectedPackages[idx];

        assert.equal(collectedPackage, expectedPackage, `Expected package '${expectedPackage}' but got package '${collectedPackage}' (position ${idx}).`);
    });
}

/**
 * Ensures that circular dependencies in the streamed workspace packages are manifested as
 * an error.
 */
async function assertCircularDependency() {
    let receivedError = undefined;

    try {
        await PackageDescriptorStreamFactory.readStreamAsync(this["workspacePackageStream"]);
    }
    catch (error) {
        receivedError = error;
    }

    if (!receivedError) throw new assert.AssertionError({ message: "Expected an error." });
}

/**
 * Ensures that the given packages are streamed before any others.
 *
 * @param expectedPackages A comma seperated string representing the name of the packages whose
 * order in the stream should be before any others.
 */
async function assertPackagesComesBeforeAllOthers(expectedPackages: string) {
    let collectedPackages = await pullPackages(this);

    let expectedPackageIndexes = toIndexDictionary(expectedPackages, collectedPackages);
    let collectedPackageIndexes = _.omit(_.object(collectedPackages, _.map(collectedPackages, (p) => collectedPackages.indexOf(p))), _.keys(expectedPackageIndexes));

    assertPackageOrder(expectedPackageIndexes, collectedPackageIndexes);
}

/**
 * Ensures that one set of packages are streamed before another set of packages.
 *
 * @param expectedPackages A comma seperated string representing the name of the packages whose
 * order in the stream should be before the others.
 * @param otherPackages A comma seperated string representing the name of the other packages.
 */
async function assertPackagesComesBeforeOthers(expectedPackages: string, otherPackages: string) {
    let collectedPackages = await pullPackages(this);

    let expectedPackageIndexes = toIndexDictionary(expectedPackages, collectedPackages);
    let collectedPackageIndexes = toIndexDictionary(otherPackages, collectedPackages);

    assertPackageOrder(expectedPackageIndexes, collectedPackageIndexes);
}

function assertPackageOrder(expectedPackages: Object, collectedPackages: Object): void {
    for (let expectedPackage in expectedPackages) {
        let expectedPackageIndex = expectedPackages[expectedPackage];

        for (let collectedPackage in collectedPackages) {
            let collectedPackageIndex = collectedPackages[collectedPackage];

            if (expectedPackageIndex >= collectedPackageIndex) {
                throw new assert.AssertionError({ message: `Expected package '${expectedPackage}' to come before package '${collectedPackage}'.` })
            }
        }
    }
}

/**
 * Pulls the package descriptors through the workspace package stream. The stream will only
 * be pulled once and subsequent calls during the current scenario will return the same
 * packages.
 */
async function pullPackages(world: any): Promise<string[]> {
    let collectedPackages: string[] = world["pulledWorkspacePackages"];

    if (collectedPackages) return collectedPackages;

    let workspacePackageStream: NodeJS.ReadWriteStream = world["workspacePackageStream"];

    collectedPackages = [ ];

    let collectorFunc = (packageDescriptor: any) => {
        collectedPackages.push(packageDescriptor.name);
    };

    workspacePackageStream = workspacePackageStream.pipe(new PackageDescriptorStreamActionFactory(collectorFunc).createStream());

    await PackageDescriptorStreamFactory.readStreamAsync(workspacePackageStream);

    world["pulledWorkspacePackages"] = collectedPackages;

    return collectedPackages;
}

function toDependencyDictionary(csvList: string): IDictionary<string> {
    return createDependencyDictionary<string>(csvList, (dependencyName: string, version: string) => {
        return version;
    });
}

function toIndexDictionary(csvList: string, array: string[]): IDictionary<number> {
    return createDependencyDictionary<number>(csvList, (dependencyName: string, version: string) => {
        return array.indexOf(dependencyName);
    });
}

function createDependencyDictionary<TValue>(csvList: string, func: (dependencyName: string, version: string) => TValue): IDictionary<TValue> {
    let regex = /([\w|-]+)@?((?:\^|~)?(?:\d*)(?:\.?\d*)(?:\.?\d*))?/;

    return <IDictionary<TValue>>_.object(_.map(csvList.split(","), (csvEntry) => {
        let matches = regex.exec(csvEntry);

        if (!matches) return [ ];

        return [ matches[1], func(matches[1], matches[2] || "*") ];
    }));
}

function WorkspaceSteps() {
    this.Given(/^a Workspace with:$/, populateWorkspaceWithPackages);

    this.When(/^the workspace packages are streamed$/, streamWorkspacePackages);
    this.When(/^the workspace packages are streamed with a filter that returns packages dependant on "([^"]*)"$/, streamWorkspacePackagesWithDependencyFilter);

    this.Then(/^the order of the packages received is "([^"]*)"$/, assertStreamedPackageOrder);
    this.Then(/^a circular dependency error is reported$/, assertCircularDependency);
    this.Then(/^(?:package|packages) "([^"]*)" comes before all others$/, assertPackagesComesBeforeAllOthers);
    this.Then(/^(?:package|packages) "([^"]*)" comes before "([^"]*)"$/, assertPackagesComesBeforeOthers);
}

export = WorkspaceSteps;
