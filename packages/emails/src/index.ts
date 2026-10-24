export interface EmailMessage { to: string; subject: string; text: string; html?: string }
export interface EmailSender { send(message: EmailMessage): Promise<void> }
export function verificationEmail(url: string): EmailMessage { return { to: "", subject: "Verify your NEXORA email", text: `Verify your email by opening this link: ${url}` }; }
export function passwordResetEmail(url: string): EmailMessage { return { to: "", subject: "Reset your NEXORA password", text: `Reset your password by opening this link: ${url}` }; }
export function withRecipient(message: EmailMessage, to: string): EmailMessage { return { ...message, to }; }
