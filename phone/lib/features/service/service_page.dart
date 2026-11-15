import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class ServicePage extends StatefulWidget {
  const ServicePage({super.key});

  @override
  State<ServicePage> createState() => _ServicePageState();
}

class _ServicePageState extends State<ServicePage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _plans = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final plans = await ChurchApi(context.read<SessionController>()).plans();
      if (!mounted) return;
      setState(() {
        _plans = plans;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Служение')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _plans.isEmpty
            ? const EmptyHint('Планов служения нет')
            : ListView.builder(
                itemCount: _plans.length,
                itemBuilder: (context, index) {
                  final plan = asMap(_plans[index]);
                  return ListTile(
                    title: Text(str(plan['service_date'])),
                    subtitle: Text('${str(plan['start_time'])} · ${str(plan['status'])} · блоков ${asInt(plan['blocks_count'])}'),
                    onTap: () => pushPage(context, PlanPage(id: str(plan['id']), title: str(plan['service_date']))),
                  );
                },
              ),
      ),
    );
  }
}

class PlanPage extends StatefulWidget {
  const PlanPage({super.key, required this.id, required this.title});
  final String id;
  final String title;

  @override
  State<PlanPage> createState() => _PlanPageState();
}

class _PlanPageState extends State<PlanPage> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _plan = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final plan = await ChurchApi(context.read<SessionController>()).plan(widget.id);
      if (!mounted) return;
      setState(() {
        _plan = plan;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final nested = asMap(_plan['plan']).isEmpty ? _plan : asMap(_plan['plan']);
    final blocks = asList(_plan['blocks'].runtimeType == Null ? nested['blocks'] : _plan['blocks']);
    return Scaffold(
      appBar: AppBar(title: Text(widget.title.isEmpty ? 'План' : widget.title)),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('${str(nested['service_date'])} ${str(nested['start_time'])}', style: Theme.of(context).textTheme.titleMedium),
            if (str(nested['notes']).isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(str(nested['notes'])),
            ],
            const SizedBox(height: 12),
            for (final raw in blocks)
              Builder(
                builder: (context) {
                  final block = asMap(raw);
                  final minutes = asInt(block['duration_minutes']);
                  final kind = str(block['block_type_name']).isNotEmpty
                      ? str(block['block_type_name'])
                      : str(block['block_type_code']);
                  return Card(
                    child: ListTile(
                      title: Text(str(block['title']).isEmpty ? 'Блок' : str(block['title'])),
                      subtitle: Text(
                        [
                          kind,
                          if (minutes > 0) '$minutes мин',
                          str(block['song_title']),
                          str(block['assigned_member_name']),
                        ].where((part) => part.isNotEmpty).join(' · '),
                      ),
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }
}
