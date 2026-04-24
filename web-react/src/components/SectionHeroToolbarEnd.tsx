import type { ReactNode } from 'react';

import { AccessibilityHeaderMenu } from '@/components/accessibility/AccessibilityHeaderMenu';

type Props = {
  /** Кнопки слева от «Доступность» (профиль, «Назад» и т.п.) */
  children?: ReactNode;
};

/** Правая часть градиентной шапки раздела: действия страницы + меню доступности */
export function SectionHeroToolbarEnd({ children }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 self-start pt-0.5 sm:self-center sm:pt-0">
      {children}
      <AccessibilityHeaderMenu tone="on-gradient" />
    </div>
  );
}
