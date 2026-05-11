/** Единая плоская шапка экрана: только заголовок. */
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex h-12 w-full items-center rounded-b-[20px] bg-primary px-4">
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-white">{title}</h1>
    </header>
  );
}
