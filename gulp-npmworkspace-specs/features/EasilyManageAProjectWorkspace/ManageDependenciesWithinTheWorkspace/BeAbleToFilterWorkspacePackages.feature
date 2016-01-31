@requiresWorkspace
Feature: Be able to filter workspace packages

As a Develoepr
I want to be able to filter workspace packages
So that I can apply workspace level tasks to specific sets of workspace packages

It is a typical need to be able to apply a workspace (or solution level) task to a subset
of the workspace packages that reside in a workspace. For example, running the unit tests
of packages that contain tests, or executing Less or Saas for the stylesheet assets in a
front-end project.

Scenario: Basic filtering
    Ensures that when a filter is applied the stream of workspace packages is affacted accordingly.

    Given a Workspace with:
        | package   | dependencies       |
        | package-a | express            |
        | package-b | package-a          |
        | package-c | package-b, express |
        | package-d | package-c          |
    When the workspace packages are streamed with a filter that returns packages dependant on "express"
    Then the order of the packages received is "package-a, package-c"
