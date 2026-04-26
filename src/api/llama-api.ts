import OpenAI from 'openai';

interface LlamaStreamParams {
    port: number;
    model: string;
    messages: any[];
    temperature: number;
    maxTokens: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
    grammar?: string;
    signal?: AbortSignal;
    onFirstToken?: () => void;
    onToken?: (token: string) => void;
}

export async function streamLlamaCompletion(params: LlamaStreamParams): Promise<{ resultText: string, tokenCount: number }> {
    const openai = new OpenAI({
        baseURL: `http://127.0.0.1:${params.port}/v1`,
        apiKey: "dummy-key",
        dangerouslyAllowBrowser: true,
    });

    const requestBody: any = {
        model: params.model || "local-model",
        messages: params.messages,
        stream: true,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        presence_penalty: params.repeatPenalty,
        top_k: params.topK,
        grammar: params.grammar
    };

    const stream = await openai.chat.completions.create(
        requestBody,
        { signal: params.signal }
    ) as unknown as AsyncIterable<any>;

    let resultText = "";
    let tokenCount = 0;

    for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
            if (tokenCount === 0 && params.onFirstToken) {
                params.onFirstToken();
            }
            resultText += token;
            if (params.onToken) {
                params.onToken(token);
            }
            tokenCount++;
        }
    }

    return { resultText, tokenCount };
}
