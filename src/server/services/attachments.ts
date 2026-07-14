import type { AttachmentMetadata } from "@/lib/attachments";

export interface AttachmentStorageAdapter {
  signedReadUrl(attachment: AttachmentMetadata): Promise<string>;
  deleteObject?(attachment: AttachmentMetadata): Promise<void>;
  enqueueVirusScan?(attachment: AttachmentMetadata): Promise<void>;
}

export const metadataOnlyAttachmentAdapter: AttachmentStorageAdapter = {
  async signedReadUrl(attachment) {
    return attachment.url ?? attachment.storageKey ?? "";
  },
  async enqueueVirusScan() {
    // Phase 3 defines the hook. A real scanner/outbox plugs in during the
    // attachment storage hardening work.
  },
};
