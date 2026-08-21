import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:caide_app/app.dart';

void main() {
  testWidgets('app renders welcome screen', (tester) async {
    await tester.pumpWidget(const CaideApp());

    expect(find.text('Welcome'), findsOneWidget);
    expect(find.byType(FilledButton), findsOneWidget);
  });

  testWidgets('counter increments on press', (tester) async {
    await tester.pumpWidget(const CaideApp());

    await tester.tap(find.byType(FilledButton));
    await tester.pump();

    expect(find.text('Button pressed 1 time'), findsOneWidget);
  });
}
