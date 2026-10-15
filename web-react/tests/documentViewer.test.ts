import { describe, expect, it } from 'vitest';

import { canPreviewDocumentInline } from '../src/components/documentPreviewTypes';
import { isMessengerAttachmentFileUrl } from '../src/lib/fetchAuthenticatedBlob';

describe('canPreviewDocumentInline', () => {
  it('accepts PDF by extension and mime', () => {
    expect(canPreviewDocumentInline('report.pdf', '')).toBe(true);
    expect(canPreviewDocumentInline('file.bin', 'application/pdf')).toBe(true);
  });

  it('accepts text and images', () => {
    expect(canPreviewDocumentInline('notes.txt', 'text/plain')).toBe(true);
    expect(canPreviewDocumentInline('sheet.csv', '')).toBe(true);
    expect(canPreviewDocumentInline('photo.png', 'image/png')).toBe(true);
  });

  it('rejects Office formats (need public URL for MS viewer)', () => {
    expect(canPreviewDocumentInline('doc.docx', '')).toBe(false);
    expect(canPreviewDocumentInline('book.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      false,
    );
  });
});

describe('isMessengerAttachmentFileUrl', () => {
  it('detects attachment-file proxy paths', () => {
    expect(isMessengerAttachmentFileUrl('/api/messenger/messages/12/attachment-file')).toBe(true);
    expect(
      isMessengerAttachmentFileUrl('https://app.example/api/messenger/messages/12/attachment-file?download=1'),
    ).toBe(true);
    expect(isMessengerAttachmentFileUrl('/uploads/files/a.pdf')).toBe(false);
  });
});
