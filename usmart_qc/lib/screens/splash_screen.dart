import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';

/// Provisor launch experience: layered gradients, glass hero, refined typography.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _intro;
  late final AnimationController _ambient;
  late final AnimationController _ring;
  late final AnimationController _shine;

  late final Animation<double> _fadeUp;
  late final Animation<double> _logoScale;
  late final Animation<double> _blurReveal;
  late final Animation<double> _orbDrift;

  @override
  void initState() {
    super.initState();

    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _ambient = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 8000),
    )..repeat();

    _ring = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();

    _shine = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    )..repeat();

    _fadeUp = CurvedAnimation(
      parent: _intro,
      curve: const Interval(0.15, 0.65, curve: Curves.easeOutCubic),
    );
    _logoScale = Tween<double>(begin: 0.88, end: 1.0).animate(
      CurvedAnimation(
        parent: _intro,
        curve: const Interval(0.0, 0.7, curve: Curves.easeOutBack),
      ),
    );
    _blurReveal = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _intro,
        curve: const Interval(0.2, 0.85, curve: Curves.easeOut),
      ),
    );
    _orbDrift = Tween<double>(begin: 0, end: 1).animate(_ambient);

    _intro.forward();
  }

  @override
  void dispose() {
    _intro.dispose();
    _ambient.dispose();
    _ring.dispose();
    _shine.dispose();
    super.dispose();
  }

  static const _bgTop = Color(0xFF04060F);
  static const _bgMid = Color(0xFF0B1020);
  static const _bgBottom = Color(0xFF060912);
  static const _indigo = Color(0xFF6366F1);
  static const _teal = Color(0xFF14B8A6);
  static const _violet = Color(0xFF8B5CF6);

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: _bgTop,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Base cinematic gradient
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [_bgTop, _bgMid, _bgBottom],
                stops: [0.0, 0.45, 1.0],
              ),
            ),
          ),

          // Soft mesh orbs (slow drift)
          AnimatedBuilder(
            animation: _ambient,
            builder: (context, _) {
              final t = _orbDrift.value * math.pi * 2;
              return Stack(
                children: [
                  Positioned(
                    top: -size.height * 0.08 + math.sin(t) * 14,
                    right: -size.width * 0.12 + math.cos(t * 0.9) * 18,
                    child: _GlowBlob(
                      diameter: size.width * 0.92,
                      colors: [
                        _indigo.withValues(alpha: 0.22),
                        _violet.withValues(alpha: 0.08),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  Positioned(
                    bottom: -size.height * 0.1 + math.cos(t * 1.1) * 16,
                    left: -size.width * 0.2,
                    child: _GlowBlob(
                      diameter: size.width * 1.05,
                      colors: [
                        _teal.withValues(alpha: 0.18),
                        _indigo.withValues(alpha: 0.06),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  Positioned(
                    top: size.height * 0.38,
                    left: size.width * 0.15 + math.sin(t * 1.3) * 10,
                    child: _GlowBlob(
                      diameter: size.width * 0.45,
                      colors: [
                        Colors.white.withValues(alpha: 0.04),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ],
              );
            },
          ),

          // Subtle grid (engineering / precision feel)
          CustomPaint(
            painter: _GridPainter(
              color: Colors.white.withValues(alpha: 0.03),
            ),
            size: size,
          ),

          // Top accent
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    _teal.withValues(alpha: 0.85),
                    _indigo.withValues(alpha: 0.9),
                    _violet.withValues(alpha: 0.75),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          // Content
          SafeArea(
            child: AnimatedBuilder(
              animation: _intro,
              builder: (context, _) {
                return Column(
                  children: [
                    const Spacer(flex: 2),
                    Transform.scale(
                      scale: _logoScale.value,
                      child: Opacity(
                        opacity: _fadeUp.value,
                        child: _GlassLogoCard(
                          blurSigma: 8 + 16 * _blurReveal.value,
                          shine: _shine.value,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(26),
                            child: Image.asset(
                              'assets/provisor_icon.png',
                              width: 96,
                              height: 96,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 36),
                    Opacity(
                      opacity: _fadeUp.value,
                      child: Column(
                        children: [
                          ShaderMask(
                            blendMode: BlendMode.srcIn,
                            shaderCallback: (bounds) => const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                Color(0xFFE0E7FF),
                                Color(0xFFA5B4FC),
                                Color(0xFF5EEAD4),
                              ],
                            ).createShader(bounds),
                            child: const Text(
                              'Provisor',
                              style: TextStyle(
                                fontSize: 34,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.8,
                                height: 1.05,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            AppLocalizations.of(context).t('app_subtitle'),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 1.2,
                              color: Colors.white.withValues(alpha: 0.45),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(flex: 3),
                    Opacity(
                      opacity: CurvedAnimation(
                        parent: _intro,
                        curve: const Interval(0.45, 1.0, curve: Curves.easeOut),
                      ).value,
                      child: Column(
                        children: [
                          SizedBox(
                            width: 44,
                            height: 44,
                            child: AnimatedBuilder(
                              animation: _ring,
                              builder: (context, _) {
                                return CustomPaint(
                                  painter: _GradientRingPainter(
                                    rotation: _ring.value * math.pi * 2,
                                    colors: const [_indigo, _teal, _violet, _indigo],
                                  ),
                                );
                              },
                            ),
                          ),
                          SizedBox(height: 16 + bottomInset * 0.25),
                          Text(
                            'U-SMART',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 3.5,
                              color: Colors.white.withValues(alpha: 0.22),
                            ),
                          ),
                          SizedBox(height: 8 + bottomInset * 0.5),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowBlob extends StatelessWidget {
  const _GlowBlob({
    required this.diameter,
    required this.colors,
  });

  final double diameter;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: diameter,
        height: diameter,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: colors,
            stops: List.generate(
              colors.length,
              (i) => i / (colors.length - 1),
            ),
          ),
        ),
      ),
    );
  }
}

class _GlassLogoCard extends StatelessWidget {
  const _GlassLogoCard({
    required this.child,
    required this.blurSigma,
    required this.shine,
  });

  final Widget child;
  final double blurSigma;
  final double shine;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      clipBehavior: Clip.none,
      children: [
        // Outer soft halo
        Container(
          width: 124,
          height: 124,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF6366F1).withValues(alpha: 0.35),
                blurRadius: 48,
                spreadRadius: 0,
              ),
              BoxShadow(
                color: const Color(0xFF14B8A6).withValues(alpha: 0.2),
                blurRadius: 64,
                spreadRadius: 4,
              ),
            ],
          ),
        ),
        ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
            child: Container(
              width: 112,
              height: 112,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.14),
                  width: 1.2,
                ),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Colors.white.withValues(alpha: 0.12),
                    Colors.white.withValues(alpha: 0.04),
                  ],
                ),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  child,
                  // Specular sweep
                  Positioned.fill(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(22),
                      child: CustomPaint(
                        painter: _ShinePainter(progress: shine),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ShinePainter extends CustomPainter {
  _ShinePainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width * 0.35;
    final left = -w + (size.width + w * 2) * progress;
    final rect = Rect.fromLTWH(left, 0, w, size.height);
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Colors.transparent,
          Colors.white.withValues(alpha: 0.12),
          Colors.transparent,
        ],
      ).createShader(rect);
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(covariant _ShinePainter oldDelegate) =>
      oldDelegate.progress != progress;
}

class _GradientRingPainter extends CustomPainter {
  _GradientRingPainter({
    required this.rotation,
    required this.colors,
  });

  final double rotation;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2 - 2.5;
    final rect = Rect.fromCircle(center: c, radius: r);

    final bg = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(c, r, bg);

    final sweep = 1.65 * math.pi;
    final start = rotation - math.pi / 2;

    final arcPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        startAngle: start,
        endAngle: start + sweep + 0.01,
        colors: colors,
        transform: GradientRotation(rotation),
      ).createShader(rect);

    canvas.drawArc(rect, start, sweep, false, arcPaint);
  }

  @override
  bool shouldRepaint(covariant _GradientRingPainter oldDelegate) =>
      oldDelegate.rotation != rotation;
}

class _GridPainter extends CustomPainter {
  _GridPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    const step = 48.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter oldDelegate) => false;
}
