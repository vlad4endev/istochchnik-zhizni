import { describe, expect, it } from 'vitest';

import {
  canOpenDocumentViewer,
  canPreviewDocumentInline,
  isDocxDocument,
  isOfficeDocumentNeedingPublicUrl,
  isPublicHttpDocumentUrl,
} from '../src/components/documentPreviewTypes';
import { isMessengerAttachmentFileUrl } from '../src/lib/fetchAuthenticatedBlob';

describe('canPreviewDocumentInline', () => {
  it('accepts PDF by extension and mime', () => {
    expect(canPreviewDocumentInline('report.pdf', '')).toBe(true);
    expect(canPreviewDocumentInline('file.bin', 'application/pdf')).toBe(true);
  });

  it('accepts text, images and docx locally', () => {
    expect(canPreviewDocumentInline('notes.txt', 'text/plain')).toBe(true);
    expect(canPreviewDocumentInline('sheet.csv', '')).toBe(true);
    expect(canPreviewDocumentInline('photo.png', 'image/png')).toBe(true);
    expect(canPreviewDocumentInline('letter.docx', '')).toBe(true);
    expect(
      canPreviewDocumentInline(
        'letter.bin',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('rejects legacy Office formats that need a public URL', () => {
    expect(canPreviewDocumentInline('doc.doc', '')).toBe(false);
    expect(canPreviewDocumentInline('book.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      false,
    );
  });
});

describe('office helpers', () => {
  it('detects docx vs office-needing-public-url', () => {
    expect(isDocxDocument('a.docx', '')).toBe(true);
    expect(isOfficeDocumentNeedingPublicUrl('a.docx', '')).toBe(false);
    expect(isOfficeDocumentNeedingPublicUrl('a.doc', '')).toBe(true);
    expect(isOfficeDocumentNeedingPublicUrl('a.xlsx', '')).toBe(true);
  });

  it('opens Word in the viewer instead of forcing download', () => {
    expect(canOpenDocumentViewer('letter.docx', '')).toBe(true);
    expect(canOpenDocumentViewer('legacy.doc', '')).toBe(true);
  });

  it('detects public http URLs suitable for Office Online', () => {
    expect(isPublicHttpDocumentUrl('https://cdn.example/file.docx?token=1')).toBe(true);
    expect(isPublicHttpDocumentUrl('/api/messenger/messages/1/attachment-file')).toBe(false);
    expect(
      isPublicHttpDocumentUrl('https://app.example/api/messenger/messages/1/attachment-file'),
    ).toBe(false);
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
