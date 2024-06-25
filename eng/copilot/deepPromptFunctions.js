const githubToken = process.env.GITHUB_TOKEN;
const apiKey = process.env.API_KEY;
const apiBase = process.env.API_BASE;

export async function getSessionAccess() {
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

export async function fetchDeepPromptWithQuery(query, sessionId, access_token){
    try {
        const dpResponse = await fetch("https://data-ai.microsoft.com/deepprompt/api/v1/query", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "DeepPrompt-Session-ID": sessionId,
                "Authorization": `Bearer ${accessToken}`,
                "DeepPrompt-OpenAI-API-Base": apiBase,
                "DeepPrompt-OpenAI-API-Key": apiKey,
                "DeepPrompt-OpenAI-Deployment": "gpt-4o",
            },
            body: JSON.stringify({
                query: query
            }),
        }).then((response) => response.json());
        return dpResponse.response_text;

    } catch (err) {
        console.error("Failed to fetch deep prompt rest api:", err.message);
    }
}

export function parseResponseToJson(response) {
    let trimmed = response.trim();
    if (trimmed.startsWith("```json\n") && trimmed.endsWith("```")) {
        trimmed = trimmed.substring(7, trimmed.length - 3);
    }
    trimmed = trimmed.trim();
    try {
        return JSON.parse(trimmed);
    } catch (error) {
        console.error("Failed to parse the deep prompt response to JSON:", error);
        return null;
    }
}