import prompt from "./query.json" assert { type: "json" };
import { getSessionAccess, fetchDeepPromptWithQuery, parseResponseToJson } from './deepPromptFunctions.js'
import { getLatestCommitSha, getChangedFiles, createChangeBranch, createBlob, createCommit, updateBranch, createPR } from './octokitFunctions.js'

const prId = process.env.PR_ID;
const targetRepoOwner = "Azure";
const targetRepo = "azure-webpubsub";

function getChangedFileLanguage(changedFiles) {
    for (const file of changedFiles) {
        if (file.filename.includes(".java")) {
            return "java";
        } else if (file.filename.includes(".py")) {
            return "python";
        } else if (file.filename.includes(".js")) {
            return "javascript";
        } else if (file.filename.includes(".go")) {
            return "go";
        } else if (file.filename.includes(".cs")) {
            return "csharp";
        }
    }
    return ""
}

async function syncPrChange() {
    const languages = ["javascript", "python", "csharp", "go", "java"];
    const accessSession = await getSessionAccess();
    const changedFiles = await getChangedFiles("Azure", "azure-webpubsub", prId);
    const changedFileLanguage = getChangedFileLanguage(changedFiles);
    let translatedFiles = [];
    const translationPromises = languages.map(async (language) => {
        if (language !== changedFileLanguage) {
            const languageFiles = changedFiles.filter(file => file.filename.includes(".cs") || file.filename.includes(".py") || file.filename.includes(".js") || file.filename.includes(".go") || file.filename.includes(".java"));
            const translationPromises = languageFiles.map(async (file) => {
                console.log(`[${changedFileLanguage} => ${language}]\tstart translating ${file.filename} ...`);
                const dpResponse = await translate(file, accessSession.session_id, accessSession.access_token, language);
                console.log(`[${changedFileLanguage} => ${language}]\t${file.filename} translation complete`);
                return dpResponse;
            });
            const translatedFilesForLanguage = await Promise.all(translationPromises);
            translatedFiles.push(...translatedFilesForLanguage);
        }
    });
    await Promise.all(translationPromises);


    //prepare for github commit
    const sha = await getLatestCommitSha(targetRepoOwner, targetRepo);
    let changeSha = await createChangeBranch(targetRepoOwner, targetRepo, sha);

    //stash files -> commit -> push
    const blobs = await createBlob(targetRepoOwner, targetRepo, translatedFiles);
    const treeSha = await createTree(targetRepoOwner, targetRepo, blobs, changeSha);
    const commitSha = await createCommit(targetRepoOwner, targetRepo, treeSha, changeSha);
    await updateBranch(targetRepoOwner, targetRepo, commitSha);

    //create pr
    if (changeSha === sha) {
        console.log("Branch already exists. Skipping PR creation.");
    } else {
        await createPR(targetRepoOwner, targetRepo);
    }
}

async function translate(file, sessionId, accessToken, targetLanguage) {
    const query = `
                Below is a file change patch from github pull request.
                Go through this file name and file patch then translate the file content to ${targetLanguage}.
                Return the response in stringfied json format, with fileName and fileContent.
                The file name should begin with path tests/integration-tests/${targetLanguage}
                For your response, use same environment variable(hub, connection string, messages etc.) as the original file.
                Do not omit any file content. The response should contain as many tests as the original document.

                Include these import statement as necessary in your response:
                ###
                ${prompt[targetLanguage]}
                ###
                File Name: ###${file.filename}###
                File patch:###${file.patch}###`;
    try {
        while (true) {
            const dpResponse = await fetchDeepPromptWithQuery(query, sessionId, accessToken);
            if (dpResponse && dpResponse.includes("fileName") && dpResponse.includes("fileContent")) {
                return parseResponseToJson(dpResponse.response_text);
            }
        }
    } catch (error) {
        console.error("Failed to fetch deep prompt rest api, ", error.message);
        throw error;
    }
}

syncPrChange();