import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { AudioBubble } from './AudioBubble';
import { TextBubble } from './TextBubble';
import { VideoBubble } from './VideoBubble';

/**
 * @param {{
 *   message: import('../store/chatStore').ChatMessage,
 *   onRequestContext?: (m: import('../store/chatStore').ChatMessage, clientX: number, clientY: number) => void,
 *   onPointerLongPress?: (m: import('../store/chatStore').ChatMessage) => void,
 * }} props
 */
export function MessageBubble({ message, onRequestContext, onPointerLongPress }) {
  const align = message.isSender ? 'justify-end' : 'justify-start';

  const bubbleHandlers = {
    onContextMenu: (e) => {
      e.preventDefault();
      onRequestContext?.(message, e.clientX, e.clientY);
    },
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      const t = window.setTimeout(() => {
        onPointerLongPress?.(message);
      }, 550);
      const up = () => {
        window.clearTimeout(t);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
  };

  if (message.type === 'audio') {
    return (
      <div className={`flex w-full ${align}`}>
        <div {...bubbleHandlers}>
          <AudioBubble
            messageId={message.id}
            isSender={message.isSender}
            mediaUrl={message.mediaUrl}
            durationSec={message.durationSec}
          />
        </div>
      </div>
    );
  }

  if (message.type === 'video') {
    return (
      <div className={`flex w-full max-w-[85%] ${align}`}>
        <div className="w-full max-w-sm" {...bubbleHandlers}>
          <VideoBubble mediaUrl={message.mediaUrl} isSender={message.isSender} />
        </div>
      </div>
    );
  }

  if (message.type === 'image' && message.mediaUrl) {
    const src = resolvePublicUrl(message.mediaUrl);
    return (
      <div className={`flex w-full ${align}`}>
        <button
          type="button"
          className="max-w-[85%] text-left"
          {...bubbleHandlers}
          onClick={(e) => e.stopPropagation()}
        >
          <img src={src || ''} alt="" className="max-h-64 rounded-xl object-cover" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex w-full ${align}`}>
      <div {...bubbleHandlers}>
        <TextBubble
          text={message.text}
          isSender={message.isSender}
          timestamp={message.timestamp}
          status={message.status}
          showStatus={message.isSender}
        />
      </div>
    </div>
  );
}
