import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  normalizeAssistantMarkdown,
  renderAssistantMessageContent,
} from '../src/features/messenger/assistantMessageFormat';

describe('assistantMessageFormat', () => {
  it('unescapes markdown list markers', () => {
    expect(normalizeAssistantMarkdown('\\- **Музыка:** без назначений')).toBe(
      '- **Музыка:** без назначений',
    );
  });

  it('collapses spaced bold markers from LLM', () => {
    expect(normalizeAssistantMarkdown('* *Важно:* * не спешите')).toBe('**Важно:** не спешите');
    expect(normalizeAssistantMarkdown('* * Важно * *')).toBe('**Важно**');
  });

  it('renders bold and list items as HTML', () => {
    const html = renderToStaticMarkup(
      <>
        {renderAssistantMessageContent(
          'На служение **26 июля 2026**:\n\n\\- **Музыка:** без назначений\n\\- **Медиа:** без назначений',
        )}
      </>,
    );
    expect(html).toContain('<strong');
    expect(html).toContain('июля');
    expect(html).toContain('2026');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('Музыка');
    expect(html).not.toContain('**');
    expect(html).not.toContain('\\-');
  });

  it('renders headings without hash marks', () => {
    const html = renderToStaticMarkup(
      <>{renderAssistantMessageContent('### План «Первые шаги»\n\nТекст')}</>,
    );
    expect(html).toMatch(/<h[1-4]/);
    expect(html).toContain('План');
    expect(html).not.toContain('###');
  });

  it('renders spaced bold as real strong tags', () => {
    const html = renderToStaticMarkup(
      <>{renderAssistantMessageContent('* *Важно:* * не пропускайте дни')}</>,
    );
    expect(html).toContain('<strong');
    expect(html).toContain('Важно');
    expect(html).not.toContain('* *');
    expect(html).not.toContain('**');
  });

  it('renders Bible blockquotes', () => {
    const html = renderToStaticMarkup(
      <>
        {renderAssistantMessageContent(
          'Как сказано в Иоанна 3:16:\n\n> Ибо так возлюбил Бог мир…\n> Иоанна 3:16',
        )}
      </>,
    );
    expect(html).toContain('<blockquote');
    expect(html).toContain('возлюбил Бог');
    expect(html).toContain('Иоанна');
    expect(html).toContain('3:16');
    expect(html).not.toContain('> Ибо');
  });
});
