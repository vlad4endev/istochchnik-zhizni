import { jsPDF } from 'jspdf';

import { transposeBracketChords } from './chordUtils';
import { sectionLinesToPlainHeadings } from './utils/sectionMarkers';

export function exportSongPdf(opts: {
  title: string;
  metaLine: string;
  body: string;
  transposeSemitones: number;
  fileName: string;
}): void {
  const body = sectionLinesToPlainHeadings(transposeBracketChords(opts.body, opts.transposeSemitones));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;
  const pageW = 210;
  const textW = pageW - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(opts.title, margin, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(opts.metaLine, margin, y);
  y += 8;
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(11);
  const lines = doc.splitTextToSize(body, textW);
  const lineH = 6;
  const pageH = 297;
  const bottom = pageH - margin;

  for (const line of lines) {
    if (y > bottom) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineH;
  }

  doc.save(opts.fileName.endsWith('.pdf') ? opts.fileName : `${opts.fileName}.pdf`);
}

export function exportSetlistPdf(opts: {
  setlistTitle: string;
  songs: { title: string; body: string; transpose: number }[];
  fileName: string;
}): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;
  const pageW = 210;
  const textW = pageW - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(opts.setlistTitle, margin, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const pageH = 297;
  const bottom = pageH - margin;
  const lineH = 5.5;

  for (const song of opts.songs) {
    const body = sectionLinesToPlainHeadings(transposeBracketChords(song.body, song.transpose));
    doc.setFont('helvetica', 'bold');
    if (y > bottom - 20) {
      doc.addPage();
      y = margin;
    }
    doc.text(song.title, margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(body, textW);
    for (const line of lines) {
      if (y > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineH;
    }
    y += 6;
  }

  doc.save(opts.fileName.endsWith('.pdf') ? opts.fileName : `${opts.fileName}.pdf`);
}
