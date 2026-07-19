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
});
