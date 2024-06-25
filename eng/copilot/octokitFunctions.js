import { Octokit } from "@octokit/rest";

const githubToken = process.env.GITHUB_TOKEN;
const prId = process.env.PR_ID;
const branchRef = `heads/auto-generated-integration-test-from-pr${prId}`;
const targetRepoOwner = "Azure";
const targetRepo = "azure-webpubsub";
const mainRef = "heads/main";

const octokit = new Octokit({
    auth: githubToken,
});

export async function getLatestCommitSha(owner, repo) {
    try {
        const { data } = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: mainRef,
        });
        return data.object.sha;
    } catch (error) {
        console.error("Failed to get latest commit SHA:", error.message);
        throw error;
    }
}

export async function getChangedFiles(owner, repo, prId) {
    try {
        const { data: files } = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: prId,
        });
        return files;
    } catch (error) {
        console.error(`Faield to load pull request ${prId}: `, error.message);
        throw error;
    }
}

export async function createChangeBranch(owner, repo, sha) {
    try {
        const { data } = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `refs/${branchRef}`,
        });
        console.log("Branch already exists, using existing branch SHA:", data.object.sha);
        return data.object.sha;
    } catch (error) {
        if (error.status === 404) {
            try {
                const { data: newData } = await octokit.rest.git.createRef({
                    owner,
                    repo,
                    ref: `refs/${branchRef}`,
                    sha,
                });
                console.log("Branch auto-generated-integration-test created successfully, new branch SHA:", newData.object.sha);
                return newData.object.sha;
            } catch (error) {
                console.error("Failed to create branch:", error.message);
                throw error;
            }
        } else {
            console.error("Failed to check branch existence:", error.message);
            throw error;
        }
    }
}

export async function createBlob(owner, repo, files) {
    try {
        return await Promise.all(files.map(async file => {
            const { data } = await octokit.rest.git.createBlob({
                owner,
                repo,
                content: file.fileContent,
                encoding: "utf-8",
            });
            return {
                sha: data.sha,
                path: file.fileName,
                mode: "100644",
                type: "blob",
            };
        }));
    } catch (error) {
        console.error("Failed to create blobs:", error.message);
        throw error;
    }
}

export async function createTree(owner, repo, blobs, branchSha) {
    try {
        const { data } = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree: branchSha,
            tree: blobs,
        });
        return data.sha;
    } catch (error) {
        console.error("Failed to create tree:", error.message);
        throw error;
    }
}

export async function createCommit(owner, repo, treeSha, branchSha) {
    try {
        const { data } = await octokit.rest.git.createCommit({
            owner,
            repo,
            message: "[auto-generated]sync translation pull request",
            tree: treeSha,
            parents: [branchSha],
        });
        return data.sha;
    } catch (error) {
        console.error("Failed to create commit:", error.message);
        throw error;
    }
}

export async function updateBranch(owner, repo, commitSha) {
    try {
        await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: branchRef,
            sha: commitSha,
        });
    } catch (error) {
        console.error("Failed to push the commit on branch,", error.message);
        throw error;
    }
}

export async function createPR(owner, repo) {
    try {
        const { data } = await octokit.rest.pulls.create({
            owner,
            repo,
            title: "auto-generated-Sync test",
            head: "auto-generated-integration-test",
            base: "main",
            body: "Please pull these awesome changes in!",
            draft: false,
        });
        console.log("PR created: ", data.html_url);
    } catch (error) {
        console.error("Failed to create pull request, ", error.message);
        throw error;
    }
}