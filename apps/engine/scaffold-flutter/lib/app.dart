import 'package:flutter/material.dart';

import 'features/home/home_page.dart';
import 'theme/app_theme.dart';

/// App-level state lives here (theme mode today; add auth/session/router
/// state here as the app grows). Pass controllers down via constructors.
class AppController extends ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.system;
  ThemeMode get themeMode => _themeMode;

  void toggleTheme() {
    _themeMode =
        _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }
}

class CaideApp extends StatefulWidget {
  const CaideApp({super.key});

  @override
  State<CaideApp> createState() => _CaideAppState();
}

class _CaideAppState extends State<CaideApp> {
  final _controller = AppController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _controller,
      builder: (context, _) {
        return MaterialApp(
          title: 'Caide App',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: _controller.themeMode,
          home: HomePage(controller: _controller),
        );
      },
    );
  }
}
