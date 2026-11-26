import 'package:livekit_client/livekit_client.dart';

/// Сколько раз подряд пробуем вернуться в комнату, прежде чем сдаться.
const maxRejoinAttempts = 3;

/// Пауза перед очередной попыткой: 2 с, 4 с, 8 с.
Duration rejoinDelay(int attempt) => Duration(seconds: 2 << (attempt - 1).clamp(0, 5));

/// Комната отключила нас не по воле звонка, а из-за связи (телефон свернули, сеть моргнула,
/// система усыпила сокет): звонок на сервере жив, и в него можно вернуться по новому токену.
/// Если комнату закрыл сервер, нас убрали или вошли с другого устройства — возвращаться нельзя.
bool shouldRejoinAfterDisconnect(DisconnectReason? reason) => switch (reason) {
  DisconnectReason.clientInitiated ||
  DisconnectReason.roomDeleted ||
  DisconnectReason.participantRemoved ||
  DisconnectReason.serverShutdown ||
  DisconnectReason.duplicateIdentity => false,
  _ => true,
};
