import 'package:material_ui/material_ui.dart';

import '../logic/call_layout.dart';
import 'call_widgets.dart';

/// Сцена звонка без привязки к LiveKit: встреча (сетка / говорящий крупно)
/// или разговор один на один (видео собеседника на весь экран, своя камера в углу).
class CallStage extends StatefulWidget {
  const CallStage({
    super.key,
    required this.people,
    required this.title,
    required this.isMeeting,
    required this.isVideo,
    required this.layout,
    required this.onLayout,
    this.statusText,
    this.inviteBar,
    this.controlsReserve = 112,
  });

  /// Свой участник первым, затем остальные.
  final List<CallPerson> people;
  final String title;
  final bool isMeeting;
  final bool isVideo;
  final CallLayoutMode layout;
  final ValueChanged<CallLayoutMode> onLayout;
  final String? statusText;
  final Widget? inviteBar;

  /// Высота нижней панели управления, чтобы плитки не уходили под неё.
  final double controlsReserve;

  @override
  State<CallStage> createState() => _CallStageState();
}

class _CallStageState extends State<CallStage> {
  CallPerson? _spotlight;

  @override
  Widget build(BuildContext context) {
    return widget.isMeeting ? _meeting(context) : _direct(context);
  }

  // ───── встреча ─────

  Widget _meeting(BuildContext context) {
    final people = widget.people;
    final local = people.where((p) => p.isLocal).firstOrNull;
    _spotlight = pickSpotlight<CallPerson>(people: people, isLocal: (p) => p.isLocal, isSpeaking: (p) => p.speaking, previous: _spotlight);
    return Column(
      children: [
        CallTopBar(
          title: widget.title,
          count: people.isEmpty ? 1 : people.length,
          layout: widget.layout,
          onLayout: widget.onLayout,
          quality: local?.quality,
          statusText: widget.statusText,
        ),
        if (widget.inviteBar != null) widget.inviteBar!,
        Expanded(
          child: Padding(
            padding: EdgeInsets.fromLTRB(12, 4, 12, widget.controlsReserve),
            child: people.isEmpty
                ? const SizedBox.shrink()
                : (widget.layout == CallLayoutMode.speaker && people.length > 1 ? _speaker(people) : _grid(people)),
          ),
        ),
      ],
    );
  }

  Widget _grid(List<CallPerson> people) {
    final split = splitOverflow<CallPerson>(people);
    final cells = <Widget>[
      for (final p in split.visible) ParticipantTile(key: ValueKey('tile-${p.identity}'), person: p),
      if (split.overflow > 0) OverflowTile(key: const ValueKey('tile-overflow'), count: split.overflow),
    ];
    final plan = gridPlan(cells.length);
    const gap = 8.0;
    return LayoutBuilder(
      builder: (context, box) {
        final tileW = (box.maxWidth - gap * (plan.columns - 1)) / plan.columns;
        final tileH = (box.maxHeight - gap * (plan.rows - 1)) / plan.rows;
        final rows = <Widget>[];
        for (var r = 0; r < plan.rows; r++) {
          final start = r * plan.columns;
          if (start >= cells.length) break;
          final slice = cells.sublist(start, (start + plan.columns).clamp(0, cells.length));
          rows.add(
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < slice.length; i++) ...[
                  if (i > 0) const SizedBox(width: gap),
                  SizedBox(width: tileW, height: tileH, child: slice[i]),
                ],
              ],
            ),
          );
          if (r < plan.rows - 1) rows.add(const SizedBox(height: gap));
        }
        return Column(mainAxisAlignment: MainAxisAlignment.center, children: rows);
      },
    );
  }

  Widget _speaker(List<CallPerson> people) {
    final spot = _spotlight!;
    final others = [for (final p in people) if (p != spot) p];
    return Column(
      children: [
        Expanded(child: ParticipantTile(key: ValueKey('spot-${spot.identity}'), person: spot)),
        if (others.isNotEmpty) ...[
          const SizedBox(height: 10),
          SizedBox(
            height: 112,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: others.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) => SizedBox(width: 86, child: ParticipantTile(key: ValueKey('strip-${others[i].identity}'), person: others[i], compact: true)),
            ),
          ),
        ],
      ],
    );
  }

  // ───── разговор один на один ─────

  Widget _direct(BuildContext context) {
    final remote = widget.people.where((p) => !p.isLocal).firstOrNull;
    final local = widget.people.where((p) => p.isLocal).firstOrNull;
    final remoteVideo = remote != null && remote.camOn && remote.video != null;
    final showPip = widget.isVideo && local != null && local.camOn && local.video != null;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (remoteVideo)
          Positioned.fill(child: ParticipantTile(key: const ValueKey('remote-full'), person: remote, fullBleed: true))
        else
          Center(
            child: Padding(
              padding: EdgeInsets.fromLTRB(24, 24, 24, widget.controlsReserve),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _BigPortrait(name: remote?.label ?? widget.title),
                  const SizedBox(height: 24),
                  Text(widget.title, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: Colors.white)),
                  if (widget.statusText != null) ...[
                    const SizedBox(height: 8),
                    Semantics(liveRegion: true, child: Text(widget.statusText!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15.5, color: Color(0xB3FFFFFF)))),
                  ],
                ],
              ),
            ),
          ),
        if (remoteVideo && widget.statusText != null)
          Positioned(
            top: 12,
            left: 16,
            right: 16,
            child: Align(
              alignment: Alignment.topLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: const Color(0x66000000), borderRadius: BorderRadius.circular(14)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (local?.quality != null) ...[SignalBars(local!.quality), const SizedBox(width: 8)],
                    Flexible(child: Text('${widget.title} · ${widget.statusText}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Colors.white))),
                  ],
                ),
              ),
            ),
          ),
        if (showPip) Positioned(right: 16, bottom: widget.controlsReserve + 8, child: LocalPip(track: local.video!)),
      ],
    );
  }
}

class _BigPortrait extends StatelessWidget {
  const _BigPortrait({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
      height: 150,
      child: ParticipantTile(person: CallPerson(identity: 'portrait', name: name, camOn: false, micOn: true), portraitOnly: true),
    );
  }
}
