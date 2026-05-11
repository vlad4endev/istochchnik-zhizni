/** Единая плоская шапка экрана: только заголовок, 36px. */
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex h-9 w-full items-center bg-primary px-4 lg:px-6">
      <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{title}</h1>
    </header>
  );
}
