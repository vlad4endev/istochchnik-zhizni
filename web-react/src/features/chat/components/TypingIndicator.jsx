export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <div
        className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]"
      />
      <div
        className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]"
      />
      <div
        className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]"
      />
    </div>
  );
}
