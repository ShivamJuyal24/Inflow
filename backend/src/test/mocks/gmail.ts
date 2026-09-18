import { vi } from "vitest";

export const gmailMock = vi.hoisted(() => ({
  getMessage: vi.fn(),
  sendReply: vi.fn(),
  listMessages: vi.fn(),
}));