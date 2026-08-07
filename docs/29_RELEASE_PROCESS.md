# Release Process

## Scope

This lightweight process applies to tagged SiagaLongsor software/research releases. A release PR must be reviewed and merged before a tag is created.

## Release checklist

1. Prepare a release branch and PR with documentation, acceptance references, and green CI.
2. Confirm `main` is clean and synchronized.
3. Review the relevant acceptance evidence, especially [R10 final acceptance](27_R10_FINAL_ACCEPTANCE_REPORT.md).
4. Select a semantic version/tag. Research releases may use a prerelease suffix.
5. Create an annotated tag, publish it, create GitHub Release notes, then perform post-tag health/smoke verification.

For the first research release, the intended tag is `v0.1.0-research`. It must be created only after the documentation PR is merged:

```sh
git switch main
git pull --ff-only origin main
git status --short

git tag -a v0.1.0-research \
  -m "SiagaLongsor v0.1.0-research — software/research release"

git show v0.1.0-research --no-patch
git push origin v0.1.0-research
```

Do not run these commands from an unreviewed working tree. Mark the GitHub Release as a prerelease/research release, not as a scientifically calibrated production release.

## Release notes and verification

Release notes should summarize scope, validation evidence, known limitations, and migration compatibility. Post-tag verification should confirm the tag points to the intended commit, release assets/notes are correct, and the documented smoke checks complete in the target environment.

## Hotfix and rollback principles

Hotfixes use a reviewed branch and a new annotated tag. An application rollback may use a prior known-good tag/build. Database migrations are not blindly reversed: schema-related recovery requires an explicit compatible plan.

