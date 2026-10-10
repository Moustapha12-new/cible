import { AsyncLocalStorage } from "node:async_hooks";
type AccountContext = { email: string; checkpoints?: Map<string, unknown> };
const context = new AsyncLocalStorage<AccountContext>();
export const gmailAccountContext = () => context.getStore();
export function withGmailAccount<T>(email: string, work: () => T): T {
  return context.run({ email: email.trim().toLowerCase() }, work);
}
