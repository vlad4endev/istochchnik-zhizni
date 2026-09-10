import { create } from 'zustand';

export type PushRegistrationStatus =
  | 'idle'
  | 'unsupported'
  | 'denied'
  | 'registered'
  | 'error';

interface PushStatusState {
  status: PushRegistrationStatus;
  setStatus: (status: PushRegistrationStatus) => void;
}

export const usePushStatusStore = create<PushStatusState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));

export function pushStatusLabel(status: PushRegistrationStatus): string {
  switch (status) {
    case 'registered':
      return 'Уведомления подключены';
    case 'denied':
      return 'Разрешение отклонено';
    case 'unsupported':
      return 'Нужно реальное устройство';
    case 'error':
      return 'Ошибка регистрации (проверьте google-services.json)';
    default:
      return 'Ожидание…';
  }
}
