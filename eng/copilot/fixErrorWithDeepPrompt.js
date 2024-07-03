import { Octokit } from "@octokit/rest";
import { getSessionAccess, fetchDeepPromptWithQuery, parseResponseToJson } from './deepPromptFunctions.js'
import { getChangedFiles, createChangeBranch, createBlob, createCommit, updateBranch, createPR, getLatestCommitShaOnPr, createTree } from './octokitFunctions.js'
import { githubToken, prId, errorMessage } from "./constants.js";

function getErrorMessage(ciError) {
    const lines = ciError.split('\n');
    let errors = [];
    let currentError = null;

    lines.forEach(line => {
        const errorCollectingPrefix = 'ERROR collecting ';
        const errorSummaryPrefix = 'short test summary info ';
        if (line.includes(errorSummaryPrefix)) {
            if (currentError) {
                errors.push(currentError);
            }
        }
        else if (line.includes(errorCollectingPrefix)) {
            if (currentError) {
                errors.push(currentError);
            }
            const filename = line.substring(line.indexOf(errorCollectingPrefix) + 16, line.indexOf(' ________________'));
            currentError = { filename: filename.trim(), errorMessage: '' };
        } else if (currentError) {
            currentError.errorMessage += line + '\n';
        }
    });

    return errors;
}

async function fixErrorWithDP(file, errorMessage, sessionId, accessToken) {
    const query = `
                Below is a file change patch from git hub pull request, it failed to pass the ci test.
                Base on the error message, rewrite the code of this file to fix the error.
                Return the respinses in stringfied json format with fileName and fileContent.
                file name: ###${file.filename}###
                file dispatch: ###${file.patch}###
                error message: ###${errorMessage}###`;
    try {
        while (true) {
            const dpResponse = await fetchDeepPromptWithQuery(query, sessionId, accessToken);
            if (dpResponse && dpResponse.includes("fileName") && dpResponse.includes("fileContent")) {
                return parseResponseToJson(dpResponse);
            }
        }

    } catch (err) {
        console.error("Failed to fetch deep prompt rest api:", err.message);
    }
}

async function fix() {
    try {
        const errors = getErrorMessage(errorMessage);
        const accessSession = await getSessionAccess();
        const files = await getChangedFiles("Azure", "azure-webpubsub", prId);
        let fixedFiles = [];
        const errorFixPromises = errors.map(async (error) => {
            const filesWithError = files.filter(file => file.filename.includes(error.filename));
            const fileFixPromises = filesWithError.map(async (file) => {
                console.log(`start fixing error in ${file.filename} ...`);
                const fixedFile = await fixErrorWithDP(file, error.errorMessage, accessSession.session_id, accessSession.access_token);
                console.log(`${file.filename} error fix complete`);
                return fixedFile;
            });
            const fixedFilesForError = await Promise.all(fileFixPromises);
            fixedFiles.push(...fixedFilesForError);
        });
        await Promise.all(errorFixPromises);
        // const sha = await getLatestCommitShaOnPr(targetRepoOwner, targetRepo, prId);
        // const blobs = await createBlob(targetRepoOwner, targetRepo, fixedFiles);
        // const treeSha = await createTree(targetRepoOwner, targetRepo, blobs, sha);
        // const commitSha = await createCommit(targetRepoOwner, targetRepo, treeSha, sha);
        // await updateBranch(targetRepoOwner, targetRepo, commitSha);
        // console.log(`fix attempt completed and pushed to pr ${prId}`);

    } catch (error) {
        console.error('Error occurred during fix:', error.message);
    }
}

fix();



