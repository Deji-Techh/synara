import 'package:flutter/material.dart';

import '../../app.dart';

/// The entry screen. Replace the placeholder cards with real features;
/// keep this file thin by extracting widgets into feature folders:
/// lib/features/`<feature>`/ with one file per screen/widget/controller.
class HomePage extends StatelessWidget {
  const HomePage({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Caide App'),
        actions: [
          IconButton(
            tooltip: 'Toggle theme',
            icon: const Icon(Icons.brightness_6_outlined),
            onPressed: controller.toggleTheme,
          ),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: ListView(
            padding: const EdgeInsets.all(24),
            shrinkWrap: true,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.rocket_launch_outlined,
                        size: 40,
                        color: colorScheme.primary,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Welcome',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'This is a Flutter starter built by Caide. '
                        'Describe what you want to build and the agent will '
                        'extend this app for you.',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const _CounterCard(),
            ],
          ),
        ),
      ),
    );
  }
}

/// Minimal example of idiomatic state management without extra packages:
/// a ChangeNotifier + ListenableBuilder. Swap in Riverpod/Bloc later only
/// if the app actually needs it.
class _CounterCard extends StatefulWidget {
  const _CounterCard();

  @override
  State<_CounterCard> createState() => _CounterCardState();
}

class _CounterCardState extends State<_CounterCard> {
  int _count = 0;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'Button pressed $_count ${_count == 1 ? 'time' : 'times'}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            FilledButton.icon(
              onPressed: () => setState(() => _count++),
              icon: const Icon(Icons.add),
              label: const Text('Press'),
            ),
          ],
        ),
      ),
    );
  }
}
