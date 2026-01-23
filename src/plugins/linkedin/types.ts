import { Contact } from '../../shared/contact';

export interface LinkedinMessage {
    conversationId: string;
    conversationTitle?: string;
    from: string;
    senderProfileUrl?: string;
    to: string;
    recipientProfileUrls?: string;
    date: string;
    subject?: string;
    content: string;
    folder?: string;
}

export const MESSAGE_SCHEMA = `
#LinkedinMessage
* conversationId: unique identifier for the conversation
* conversationTitle: title of the conversation
* from: sender name
* senderProfileUrl: LinkedIn profile URL of the sender
* to: recipient name(s)
* recipientProfileUrls: LinkedIn profile URL(s) of the recipient(s)
* date: date of the message
* subject: subject of the message
* content: content of the message body (HTML or text)
* folder: folder where the message is stored (e.g., INBOX)
`;
