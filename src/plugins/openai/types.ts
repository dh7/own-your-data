export interface OpenAIExport {
    title: string;
    create_time: number;
    update_time: number;
    mapping: { [key: string]: OpenAINode };
    current_node: string | null;
}

export interface OpenAINode {
    id: string;
    message: OpenAIMessage | null;
    parent: string | null;
    children: string[];
}

export interface OpenAIMessage {
    id: string;
    author: {
        role: 'system' | 'user' | 'assistant' | 'tool';
        name: string | null;
        metadata: any;
    };
    create_time: number | null;
    content: {
        content_type: 'text' | 'multimodal_text' | 'code' | 'execution_output';
        parts: (string | any)[];
    };
    status: string;
    metadata?: any;
}
