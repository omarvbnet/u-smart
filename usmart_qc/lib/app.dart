import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'l10n/app_localizations.dart';
import 'l10n/app_localizations_delegate.dart';
import 'providers/auth_provider.dart';
import 'providers/locale_provider.dart';
import 'screens/login_screen.dart';
import 'screens/company_dashboard_screen.dart';
import 'screens/engineer_dashboard_screen.dart';

class ProvisrApp extends StatelessWidget {
  const ProvisrApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer2<AuthProvider, LocaleProvider>(
      builder: (context, auth, localeProv, _) {
        final locale = localeProv.effectiveLocale;
        final isRtl = localeProv.isRtl;
        return Directionality(
          textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
          child: MaterialApp(
            title: 'Provisor',
            debugShowCheckedModeBanner: false,
            locale: locale,
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: const [
              AppLocalizationsDelegate(),
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF05051A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF6C63FF),
          secondary: Color(0xFF00D4AA),
          surface: Color(0xFF12122A),
          error: Color(0xFFFF4757),
        ),
        useMaterial3: true,
        fontFamily: isRtl ? null : 'Inter',
        pageTransitionsTheme: const PageTransitionsTheme(
          builders: {
            TargetPlatform.android: CupertinoPageTransitionsBuilder(),
            TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          },
        ),
            ),
            home: auth.loading
          ? const SplashScreen()
          : auth.isLoggedIn
              ? (auth.isEngineer
                  ? const EngineerDashboardScreen()
                  : const CompanyDashboardScreen()) // COMPANY, PERSONAL, TECHNICIAN, WORKER
              : const LoginScreen(),
          ),
        );
      },
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late AnimationController _logoController;
  late AnimationController _contentController;
  late AnimationController _pulseController;
  late AnimationController _particleController;

  late Animation<double> _logoScale;
  late Animation<double> _logoOpacity;
  late Animation<double> _logoRotation;
  late Animation<double> _glowExpand;
  late Animation<double> _titleOpacity;
  late Animation<Offset> _titleSlide;
  late Animation<double> _subtitleOpacity;
  late Animation<double> _loaderOpacity;
  late Animation<double> _pulseAnim;
  late Animation<double> _particleAnim;

  @override
  void initState() {
    super.initState();

    // Logo entrance: scale + rotate + fade with satisfying bounce
    _logoController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _logoScale = Tween<double>(begin: 0.2, end: 1.0).animate(
      CurvedAnimation(
        parent: _logoController,
        curve: const Interval(0, 0.75, curve: Curves.elasticOut),
      ),
    );
    _logoOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _logoController,
        curve: const Interval(0, 0.5, curve: Curves.easeOut),
      ),
    );
    _logoRotation = Tween<double>(begin: -0.1, end: 0).animate(
      CurvedAnimation(
        parent: _logoController,
        curve: const Interval(0, 0.6, curve: Curves.easeOutBack),
      ),
    );
    _glowExpand = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _logoController,
        curve: const Interval(0.3, 1.0, curve: Curves.easeOut),
      ),
    );

    // Content: title, subtitle, loader
    _contentController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _titleOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _contentController,
        curve: const Interval(0, 0.5, curve: Curves.easeOut),
      ),
    );
    _titleSlide = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _contentController,
        curve: const Interval(0, 0.5, curve: Curves.easeOutCubic),
      ),
    );
    _subtitleOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _contentController,
        curve: const Interval(0.3, 0.7, curve: Curves.easeOut),
      ),
    );
    _loaderOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _contentController,
        curve: const Interval(0.6, 1.0, curve: Curves.easeOut),
      ),
    );

    // Continuous pulse glow
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    );
    _pulseAnim = Tween<double>(begin: 0.4, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Particle float
    _particleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 6000),
    );
    _particleAnim = Tween<double>(begin: 0, end: 1).animate(_particleController);

    // Staggered start: logo animates first, then content
    _logoController.forward();
    Future.delayed(const Duration(milliseconds: 700), () {
      if (mounted) _contentController.forward();
    });
    Future.delayed(const Duration(milliseconds: 800), () {
      if (mounted) {
        _pulseController.repeat(reverse: true);
        _particleController.repeat();
      }
    });
  }

  @override
  void dispose() {
    _logoController.dispose();
    _contentController.dispose();
    _pulseController.dispose();
    _particleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: Stack(
        children: [
          // Animated background gradient orbs
          AnimatedBuilder(
            animation: _pulseAnim,
            builder: (context, _) => Stack(
              children: [
                Positioned(
                  top: size.height * 0.1,
                  right: -60,
                  child: Container(
                    width: 240 + _pulseAnim.value * 40,
                    height: 240 + _pulseAnim.value * 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          Color.fromARGB(
                            (30 * _pulseAnim.value).toInt(),
                            108, 99, 255,
                          ),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  bottom: size.height * 0.15,
                  left: -80,
                  child: Container(
                    width: 280 + _pulseAnim.value * 30,
                    height: 280 + _pulseAnim.value * 30,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          Color.fromARGB(
                            (20 * _pulseAnim.value).toInt(),
                            0, 212, 170,
                          ),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Floating particles
          AnimatedBuilder(
            animation: _particleAnim,
            builder: (context, _) => CustomPaint(
              size: size,
              painter: _ParticlePainter(_particleAnim.value),
            ),
          ),

          // Main content
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Logo with animated glow ring
                AnimatedBuilder(
                  animation: Listenable.merge([_logoController, _pulseController]),
                  builder: (context, child) {
                    return Transform.rotate(
                      angle: _logoRotation.value,
                      child: Transform.scale(
                        scale: _logoScale.value,
                        child: Opacity(
                          opacity: _logoOpacity.value,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              // Outer glow ring
                              Container(
                                width: 130 + _glowExpand.value * 20,
                                height: 130 + _glowExpand.value * 20,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: RadialGradient(
                                    colors: [
                                      Color.fromARGB(
                                        (40 * (_pulseController.isAnimating ? _pulseAnim.value : 1)).toInt(),
                                        108, 99, 255,
                                      ),
                                      Colors.transparent,
                                    ],
                                  ),
                                ),
                              ),
                              // Gradient ring border
                              Container(
                                width: 108,
                                height: 108,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(30),
                                  gradient: LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      const Color(0xFF6C63FF).withAlpha((60 * _glowExpand.value).toInt()),
                                      const Color(0xFF00D4AA).withAlpha((40 * _glowExpand.value).toInt()),
                                    ],
                                  ),
                                ),
                              ),
                              // Logo container
                              Container(
                                width: 100,
                                height: 100,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(28),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF6C63FF).withAlpha(
                                        (80 * (_pulseController.isAnimating ? _pulseAnim.value : 1)).toInt(),
                                      ),
                                      blurRadius: 40 + _glowExpand.value * 20,
                                      spreadRadius: 2 + _glowExpand.value * 4,
                                    ),
                                    BoxShadow(
                                      color: const Color(0xFF00D4AA).withAlpha(
                                        (30 * (_pulseController.isAnimating ? _pulseAnim.value : 1)).toInt(),
                                      ),
                                      blurRadius: 60,
                                      spreadRadius: _glowExpand.value * 8,
                                    ),
                                  ],
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(28),
                                  child: Image.asset(
                                    'assets/provisor_icon.png',
                                    fit: BoxFit.cover,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),

                const SizedBox(height: 40),

                // Title with slide + fade
                AnimatedBuilder(
                  animation: _contentController,
                  builder: (context, _) => FractionalTranslation(
                    translation: _titleSlide.value,
                    child: Opacity(
                      opacity: _titleOpacity.value,
                      child: ShaderMask(
                        shaderCallback: (bounds) => const LinearGradient(
                          colors: [
                            Color(0xFF6C63FF),
                            Color(0xFF9B8FFF),
                            Color(0xFF00D4AA),
                          ],
                        ).createShader(bounds),
                        child: const Text(
                          'PROVISOR',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 36,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 8,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                // Subtitle
                AnimatedBuilder(
                  animation: _contentController,
                  builder: (context, _) => Opacity(
                    opacity: _subtitleOpacity.value,
                    child: Text(
                      AppLocalizations.of(context).t('app_subtitle'),
                      style: TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 14,
                        fontWeight: FontWeight.w400,
                        letterSpacing: 2,
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 48),

                // Animated loader
                AnimatedBuilder(
                  animation: Listenable.merge([_contentController, _pulseController]),
                  builder: (context, _) => Opacity(
                    opacity: _loaderOpacity.value,
                    child: SizedBox(
                      width: 44,
                      height: 4,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: Stack(
                          children: [
                            Container(
                              decoration: BoxDecoration(
                                color: Colors.white.withAlpha(10),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                            AnimatedBuilder(
                              animation: _pulseAnim,
                              builder: (context, _) => FractionallySizedBox(
                                widthFactor: 0.3 + _pulseAnim.value * 0.2,
                                alignment: Alignment(
                                  -1 + _pulseAnim.value * 2,
                                  0,
                                ),
                                child: Container(
                                  decoration: BoxDecoration(
                                    gradient: const LinearGradient(
                                      colors: [
                                        Color(0xFF6C63FF),
                                        Color(0xFF00D4AA),
                                      ],
                                    ),
                                    borderRadius: BorderRadius.circular(2),
                                    boxShadow: [
                                      BoxShadow(
                                        color: const Color(0xFF6C63FF).withAlpha(80),
                                        blurRadius: 8,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ParticlePainter extends CustomPainter {
  final double progress;
  _ParticlePainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final rng = Random(42);
    const count = 20;

    for (int i = 0; i < count; i++) {
      final baseX = rng.nextDouble() * size.width;
      final baseY = rng.nextDouble() * size.height;
      final speed = 0.3 + rng.nextDouble() * 0.7;
      final phase = rng.nextDouble();
      final radius = 1.0 + rng.nextDouble() * 2.0;

      final t = (progress * speed + phase) % 1.0;
      final y = baseY - t * size.height * 0.3;
      final x = baseX + sin(t * pi * 2 + phase * pi * 4) * 20;
      final alpha = (sin(t * pi) * 40).toInt().clamp(0, 40);

      final isAccent = i % 3 == 0;
      final color = isAccent
          ? Color.fromARGB(alpha, 0, 212, 170)
          : Color.fromARGB(alpha, 108, 99, 255);

      canvas.drawCircle(
        Offset(x % size.width, y % size.height),
        radius,
        Paint()..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ParticlePainter oldDelegate) =>
      oldDelegate.progress != progress;
}
