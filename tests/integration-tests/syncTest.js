import { Octokit } from "@octokit/rest";

const githubToken = process.env.GITHUB_TOKEN;
const apiKey = process.env.API_KEY;
const prId = process.env.PR_ID;
const targetRepoOwner = "Azure";
const targetRepo = "azure-webpubsub"
const octokit = new Octokit({
    auth: githubToken,
});

function handleResponse(res) {
    const fileNameRegex = /\*\*File Name:\*\*\s*`([^`]+)`/;
    const fileNameMatch = res.match(fileNameRegex);
    const fileName = fileNameMatch ? fileNameMatch[1] : "No file name found";

    const fileContentRegex = /\*\*File Content:\*\*\s*\n*```([^`]+)```/;
    const fileContentMatch = res.match(fileContentRegex);
    const fileContent = fileContentMatch ? fileContentMatch[1].split("\n").slice(2).join("\n") : "No file content found";
    return { fileName: `${fileName}`, fileContent: fileContent };
}

async function getLatestCommitSha(owner, repo) {
    try {
        const { data } = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/main`,
        });
        return data.object.sha;
    } catch (error) {
        console.error("Failed to get latest commit SHA:", error.message);
        throw error;
    }
}

async function createChangeBranch(owner, repo, sha) {
    try {
        const { data } = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: "refs/heads/[auto-generated]python integration test",
        });
        console.log("Branch already exists, using existing branch SHA:", data.object.sha);
        return data.object.sha;
    } catch (error) {
        // If the branch does not exist, create new branch called "[auto-generated]python integration test"
        if (error.status === 404) {
            try {
                const { data: newData } = await octokit.rest.git.createRef({
                    owner,
                    repo,
                    ref: "refs/heads/[auto-generated]python integration test",
                    sha,
                });
                console.log("Branch [auto-generated]python integration test created successfully, new branch SHA:", newData.object.sha);
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


async function createBlob(owner, repo, files) {
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

async function createTree(owner, repo, blobs, branchSha) {
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

async function createCommit(owner, repo, treeSha, branchSha) {
    try {
        const { data } = await octokit.rest.git.createCommit({
            owner,
            repo,
            message: "sync python pull request",
            tree: treeSha,
            parents: [branchSha],
        });
        return data.sha;
    } catch (error) {
        console.error("Failed to create commit:", error.message);
        throw error;
    }
}

async function updateBranch(owner, repo, commitSha) {
    try {
        await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: "heads/[auto-generated]python integration test",
            sha: commitSha,
        });
    } catch (error) {
        console.error("Failed to push the commit on branch,", error.message);
        throw error;
    }
}

async function createPR(owner, repo) {
    try {
        const { data } = await octokit.rest.pulls.create({
            owner,
            repo,
            title: "[auto-generated]Sync Python test",
            head: "[auto-generated]python integration test",
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

async function getSessionAccess() {
    try {
        return fetch("https://data-ai.microsoft.com/deepprompt/api/v1/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: githubToken,
                provider: "github",
            }),
        }).then(res => res.json());
    } catch (error) {
        console.error("Failed to exchange github token");
        throw error;
    }
}

async function syncPrChange() {
    const accessSession = await getSessionAccess();
    const changedFiles = await getChangedFiles("Azure", "azure-webpubsub", prId);
    let translatedFiles = [];
    for (const file of changedFiles) {
        if (file.filename.includes(".cs")) {
            console.log(`start translating ${file.filename} ...`);
            const dpResponse = await translate(file, accessSession.session_id, accessSession.access_token);
            translatedFiles.push(dpResponse);
            console.log(`${file.filename} translation complete`);
        }
    }

    //prepare for github commit
    const sha = await getLatestCommitSha(targetRepoOwner, targetRepo);
    const changeSha = await createChangeBranch(targetRepoOwner, targetRepo, sha);

    //stash files -> commit -> push
    const blobs = await createBlob(targetRepoOwner, targetRepo, translatedFiles);
    const treeSha = await createTree(targetRepoOwner, targetRepo, blobs, changeSha);
    const commitSha = await createCommit(targetRepoOwner, targetRepo, treeSha, changeSha);
    await updateBranch(targetRepoOwner, targetRepo, commitSha);

    //create pr
//    await createPR(targetRepoOwner, targetRepo);
}

async function translate(file, sessionId, accessToken) {
    const query = `
                Below is a file change patch from github pull request.
                Go through this file name and file patch then translate the file content to python using pytest for live tests.
                Return the file name and file content in your response.
                The file name should begin with path "tests/integration-tests/python"
                For your response, use same environment variable(hub, connection string, messages etc.) as the original file.
                Do not omit any file content. The response should contain as many tests as the original document.

                Include these import statement as necessary in your response:
                ###
                import json
                import pytest
                from azure.core.exceptions import HttpResponseError, ServiceRequestError
                from azure.messaging.webpubsubservice._operations._operations import \
                build_send_to_all_request
                from devtools_testutils import recorded_by_proxy
                from testcase import WebpubsubPowerShellPreparer, WebpubsubTest
                ###`;
    try {
        while (true) {
            const dpResponse = await fetch("https://data-ai.microsoft.com/deepprompt/api/v1/query", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "DeepPrompt-Session-ID": sessionId,
                    "Authorization": `Bearer ${accessToken}`,
                    "DeepPrompt-OpenAI-API-Base": "https://lianwei-ai-aiservices.openai.azure.com/",
                    "DeepPrompt-OpenAI-API-Key": apiKey,
                    "DeepPrompt-OpenAI-Deployment": "gpt-4o",
                },
                body: JSON.stringify({
                    query: `${query}\n File Name: ###${file.filename}\n ###File patch:\n ###${file.patch}###`,
                }),
            }).then(res => res.json());
            if (dpResponse.response_text.includes("File Name") && dpResponse.response_text.includes("File Content")) {
                return handleResponse(dpResponse.response_text);
            }
        }
    } catch (error) {
        console.error("Failed to fetch deep prompt rest api, ", error.message);
        throw error;
    }
}

async function getChangedFiles(owner, repo, prId) {
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

syncPrChange();